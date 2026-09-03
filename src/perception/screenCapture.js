/**
 * Pilot Desktop Perception & Visual Screenshot Engine
 * Captures full desktop display or active window for Gemini Multimodal Vision inspection.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { promises as fs } from 'fs';
import * as browser from '../browser/controller.js';

const execAsync = promisify(exec);

/**
 * Capture full desktop state (screenshot + active windows list).
 */
export async function captureScreen() {
  let activeWindows = [];

  // 1. Try native desktop capture script
  try {
    const scriptPath = join(process.cwd(), 'src', 'perception', 'getDesktopState.ps1');
    const outputPath = join(process.cwd(), 'data', 'latest_screen.jpg');
    const { stdout } = await execAsync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -OutputPath "${outputPath}"`, { timeout: 5000 });
    
    try {
      const parsed = JSON.parse(stdout.trim());
      if (parsed.activeWindows && Array.isArray(parsed.activeWindows)) {
        activeWindows = parsed.activeWindows;
      }
    } catch {}

    const buffer = await fs.readFile(outputPath);
    if (buffer && buffer.length > 500) {
      return {
        success: true,
        source: 'desktop',
        buffer,
        base64: buffer.toString('base64'),
        activeWindows,
      };
    }
  } catch {}

  // 2. Fallback to active Playwright browser viewport screenshot
  if (browser.isRunning()) {
    try {
      const buffer = await browser.screenshot();
      if (buffer && buffer.length > 500) {
        return {
          success: true,
          source: 'browser',
          buffer,
          base64: buffer.toString('base64'),
          activeWindows,
        };
      }
    } catch {}
  }

  return { success: false, error: 'Could not capture desktop or browser screen.', activeWindows };
}

/**
 * Inspect what is currently visible on the screen using Gemini Vision.
 */
export async function inspectScreen(prompt = 'What is currently displayed on this screen? Describe the main applications, windows, error messages, or contents in detail.', clientScreenshot = null) {
  let cap = null;

  if (clientScreenshot && typeof clientScreenshot === 'string' && clientScreenshot.length > 100) {
    try {
      const rawBase64 = clientScreenshot.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(rawBase64, 'base64');
      cap = {
        success: true,
        source: 'desktop',
        buffer,
        base64: rawBase64,
        activeWindows: [],
      };
    } catch {}
  }

  if (!cap) {
    cap = await captureScreen();
  }

  if (!cap.success) {
    return {
      success: false,
      error: cap.error || 'Failed to capture screen.',
    };
  }

  // Guard against blank/black frames (e.g. background DWM isolation or unrendered video buffers)
  if (cap.buffer && cap.buffer.length > 0) {
    let nonZero = 0;
    const limit = Math.min(cap.buffer.length, 3000);
    for (let i = 80; i < limit; i++) {
      if (cap.buffer[i] > 15) nonZero++;
    }
    if (nonZero < 30) {
      return {
        success: false,
        error: 'The captured screen image appeared completely black or blank. Please make sure to select "Entire Screen" when prompted by your browser at http://localhost:3000.',
      };
    }
  }

  try {
    const { generateContent } = await import('../ai/gemini.js');
    const windowsContext = (cap.activeWindows && cap.activeWindows.length > 0)
      ? `\nDetected Active Windows/Apps:\n${cap.activeWindows.map(w => `• ${w}`).join('\n')}\n`
      : '';

    const visionPrompt = `You are Pilot, an advanced AI Operating Layer with multimodal computer vision.
Analyze this snapshot of the user's laptop screen.

User Question/Prompt: "${prompt}"
${windowsContext}
Provide a clean, structured visual breakdown in Markdown:
1. 🖥️ **Active Applications & Windows:** (List all visible apps, browser tabs, or tools)
2. 👁️ **Main Content & Visual Details:** (Describe what is shown on screen, text, charts, code, or messages)
3. 📌 **Current Context / State:** (What task or workflow is in progress)

Keep your response sharp, clear, and direct.`;

    const mimeType = (cap.buffer && cap.buffer[0] === 0xFF && cap.buffer[1] === 0xD8) ? 'image/jpeg' : 'image/png';
    const imagePart = {
      inlineData: {
        data: cap.buffer.toString('base64'),
        mimeType,
      },
    };

    const analysis = await generateContent([visionPrompt, imagePart]);

    return {
      success: true,
      source: cap.source,
      analysis,
      screenshot: cap.base64,
    };
  } catch (err) {
    return {
      success: false,
      error: `Screen vision analysis failed: ${err.message}`,
    };
  }
}
