/**
 * Desktop Window & Input Controller for Windows
 * Focuses application windows, types text, and sends keystrokes.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchApp } from './appLauncher.js';
import { togglePlayPause } from './mediaController.js';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_BRIDGE_SCRIPT = path.join(__dirname, 'desktopBridge.ps1');

/**
 * Focus an application window by name or pattern.
 */
export async function focusWindow(appName) {
  try {
    const cmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${DESKTOP_BRIDGE_SCRIPT}" -Action focus -Target "${appName}"`;
    await execAsync(cmd);
    return { success: true, appName, message: `Focused ${appName} window.` };
  } catch (err) {
    return { success: false, appName, error: err.message };
  }
}

/**
 * Type text into the active/focused desktop application.
 */
export async function typeDesktopText(text, targetApp = '') {
  try {
    const base64Text = Buffer.from(text || '', 'utf-8').toString('base64');
    const psCmd = `$text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64Text}')); $target = '${targetApp}'; $ws = New-Object -ComObject WScript.Shell; if ($target) { $ws.AppActivate($target) | Out-Null; Start-Sleep -Milliseconds 400 }; $ws.SendKeys($text)`;
    await execAsync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psCmd}"`);
    return { success: true, text, message: `Typed "${text}" into ${targetApp || 'application'}.` };
  } catch (err) {
    return { success: false, text, error: err.message };
  }
}

/**
 * Send a keystroke to the active desktop application.
 */
export async function sendDesktopKey(key, targetApp = '') {
  try {
    let keyFormat = key;
    if (key.toLowerCase() === 'enter') keyFormat = '{ENTER}';
    else if (key.toLowerCase() === 'tab') keyFormat = '{TAB}';
    else if (key.toLowerCase() === 'esc' || key.toLowerCase() === 'escape') keyFormat = '{ESC}';
    else if (key.toLowerCase() === 'space') keyFormat = ' ';
    else if (key.toLowerCase() === 'ctrl+s') keyFormat = '^s';
    else if (key.toLowerCase() === 'ctrl+a') keyFormat = '^a';
    else if (key.toLowerCase() === 'ctrl+c') keyFormat = '^c';
    else if (key.toLowerCase() === 'ctrl+v') keyFormat = '^v';

    const cmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${DESKTOP_BRIDGE_SCRIPT}" -Action key -Target "${targetApp}" -Text "${keyFormat}"`;
    await execAsync(cmd);
    return { success: true, key, message: `Sent key "${key}" to ${targetApp || 'application'}.` };
  } catch (err) {
    return { success: false, key, error: err.message };
  }
}

/**
 * Compound action: Open application and trigger playback (Spotify or media players).
 */
export async function openAndPlay(appName = 'spotify') {
  // 1. Launch the application
  const launchRes = await launchApp(appName);
  
  // 2. Wait 2 seconds for the app window and audio engine to fully initialize
  await new Promise(r => setTimeout(r, 2000));

  // 3. Ensure window focus
  await focusWindow(appName);
  await new Promise(r => setTimeout(r, 500));

  // 4. Send the global media Play key to trigger playback
  await togglePlayPause();

  return {
    success: true,
    appName,
    message: `Opened ${appName} and started playback of your current song.`,
  };
}
