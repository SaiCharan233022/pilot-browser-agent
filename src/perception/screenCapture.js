/**
 * Pilot Desktop Perception & Visual Screenshot Engine
 * Captures full desktop display or active window for Gemini Vision inspection.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { promises as fs } from 'fs';
import * as browser from '../browser/controller.js';
import { analyzeScreenshot } from '../ai/gemini.js';

const execAsync = promisify(exec);

/**
 * Capture full desktop or active window screenshot as Base64.
 */
export async function captureScreen() {
  // 1. Try native PowerShell desktop capture
  try {
    const scriptPath = join(process.cwd(), 'src', 'perception', 'captureDesktop.ps1');
    const outputPath = join(process.cwd(), 'data', 'latest_screen.jpg');
    await execAsync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -OutputPath "${outputPath}"`, { timeout: 4000 });
    const buffer = await fs.readFile(outputPath);
    if (buffer && buffer.length > 1000) {
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
      if (buffer && buffer.length > 1000) {
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
    const analysis = await analyzeScreenshot(cap.buffer, {
      task: prompt,
      url: cap.source === 'desktop' ? 'Windows Desktop' : 'Active Browser Window',
      title: 'Full Screen Perception',
      stepDescription: prompt,
    });

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
