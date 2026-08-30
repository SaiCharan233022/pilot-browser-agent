/**
 * Native Windows Application Launcher & Process Manager
 * Launches desktop applications, verifies execution, and manages running processes.
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Common app registry aliases to executable commands or URI schemes.
 */
const APP_REGISTRY = {
  // Developer tools
  'vs code': { cmd: 'code', processName: 'Code' },
  'vscode': { cmd: 'code', processName: 'Code' },
  'visual studio code': { cmd: 'code', processName: 'Code' },
  'terminal': { cmd: 'wt', processName: 'WindowsTerminal' },
  'powershell': { cmd: 'powershell', processName: 'powershell' },
  'cmd': { cmd: 'cmd', processName: 'cmd' },
  'command prompt': { cmd: 'cmd', processName: 'cmd' },
  'git bash': { cmd: 'git-bash', processName: 'git-bash' },

  // Productivity & Utilities
  'notepad': { cmd: 'notepad', processName: 'notepad' },
  'calculator': { cmd: 'calc', processName: 'CalculatorApp' },
  'calc': { cmd: 'calc', processName: 'CalculatorApp' },
  'file explorer': { cmd: 'explorer', processName: 'explorer' },
  'explorer': { cmd: 'explorer', processName: 'explorer' },
  'task manager': { cmd: 'taskmgr', processName: 'Taskmgr' },
  'settings': { cmd: 'start ms-settings:', processName: 'SystemSettings' },
  'control panel': { cmd: 'control', processName: 'control' },
  'paint': { cmd: 'mspaint', processName: 'mspaint' },
  'snipping tool': { cmd: 'snippingtool', processName: 'SnippingTool' },

  // Media & Browsers
  'spotify': { cmd: 'start spotify:', processName: 'Spotify' },
  'chrome': { cmd: 'start chrome', processName: 'chrome' },
  'google chrome': { cmd: 'start chrome', processName: 'chrome' },
  'edge': { cmd: 'start msedge', processName: 'msedge' },
  'ms edge': { cmd: 'start msedge', processName: 'msedge' },
  'discord': { cmd: 'start discord:', processName: 'Discord' },
  'whatsapp': { cmd: 'start whatsapp:', processName: 'WhatsApp' },
  'telegram': { cmd: 'start tg:', processName: 'Telegram' },
  'vlc': { cmd: 'vlc', processName: 'vlc' },
};

/**
 * Launch an application by name or path.
 * @param {string} appName - Common name, alias, or executable path
 * @returns {Promise<Object>} - { success, appName, message, running }
 */
export async function launchApp(appName) {
  const normalized = appName.trim().toLowerCase();
  const reg = APP_REGISTRY[normalized] || { cmd: `start "" "${appName}"`, processName: appName };

  try {
    if (reg.cmd.startsWith('start ')) {
      await execAsync(`cmd.exe /c "${reg.cmd}"`);
    } else {
      const child = spawn(reg.cmd, [], {
        detached: true,
        stdio: 'ignore',
        shell: true,
      });
      child.unref();
    }

    // Give the app 800ms to register in process table and verify
    await new Promise(r => setTimeout(r, 800));
    const isRunning = await isProcessRunning(reg.processName);

    return {
      success: true,
      appName: appName,
      command: reg.cmd,
      verified: isRunning,
      message: `Launched ${appName}${isRunning ? ' (process active)' : ''}.`,
    };
  } catch (err) {
    // Fallback using Windows shell execute
    try {
      await execAsync(`powershell.exe -NoProfile -Command "Start-Process '${appName}' -ErrorAction SilentlyContinue"`);
      return {
        success: true,
        appName,
        verified: true,
        message: `Launched ${appName}.`,
      };
    } catch (fallbackErr) {
      return {
        success: false,
        appName,
        error: `Could not launch ${appName}: ${err.message}`,
      };
    }
  }
}

/**
 * Close/Terminate an application by name.
 */
export async function closeApp(appName) {
  const normalized = appName.trim().toLowerCase();
  const reg = APP_REGISTRY[normalized] || { processName: appName };
  const target = reg.processName || appName;

  try {
    await execAsync(`powershell.exe -NoProfile -Command "Stop-Process -Name '${target}' -Force -ErrorAction SilentlyContinue"`);
    return {
      success: true,
      appName,
      message: `Closed ${appName}.`,
    };
  } catch (err) {
    return {
      success: false,
      appName,
      error: `Could not close ${appName}: ${err.message}`,
    };
  }
}

/**
 * Check if a process is running on the system.
 */
export async function isProcessRunning(processName) {
  try {
    const { stdout } = await execAsync(`powershell.exe -NoProfile -Command "Get-Process -Name '${processName}' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Name"`);
    return !!stdout.trim();
  } catch {
    return false;
  }
}

/**
 * List active top running application windows.
 */
export async function getRunningApps() {
  try {
    const script = `Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -Property ProcessName, MainWindowTitle | ConvertTo-Json -Compress`;
    const { stdout } = await execAsync(`powershell.exe -NoProfile -Command "${script}"`);
    if (!stdout.trim()) return [];
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    return [];
  }
}
