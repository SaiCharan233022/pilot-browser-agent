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
 * Capture full desktop or active window screenshot as Base64.
 */
export async function captureScreen() {
  // 1. Try native dual-engine desktop capture (GDI BitBlt + CopyFromScreen)
  try {
    const scriptPath = join(process.cwd(), 'src', 'perception', 'captureDesktop.ps1');
    const outputPath = join(process.cwd(), 'data', 'latest_screen.jpg');
    await execAsync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -OutputPath "${outputPath}"`, { timeout: 4000 });
    const buffer = await fs.readFile(outputPath);
    if (buffer && buffer.length > 500) {
      return {
        success: true,
        source: 'desktop',
        buffer,
        base64: buffer.toString('base64'),
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
        };
      }
    } catch {}
  }

  return { success: false, error: 'Could not capture desktop or browser screen.' };
}

/**
 * Inspect what is currently visible on the screen using Gemini Vision.
 */
export async function inspectScreen(prompt = 'What is currently displayed on this screen? Describe the main applications, windows, error messages, or contents in detail.') {
  const cap = await captureScreen();
  if (!cap.success) {
    return {
      success: false,
      error: cap.error || 'Failed to capture screen.',
    };
  }

  try {
    const { generateContent } = await import('../ai/gemini.js');
    const visionPrompt = `You are Pilot, an advanced AI Operating Layer with multimodal computer vision.
Analyze this screenshot of the user's laptop screen.

User Question/Prompt: "${prompt}"

Provide a clean, structured visual breakdown in Markdown:
1. 🖥️ **Active Applications & Windows:** (List all visible apps, browser tabs, or tools)
2. 👁️ **Main Content & Visual Details:** (Describe what is shown in the center of the screen, text, charts, code, or messages)
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
