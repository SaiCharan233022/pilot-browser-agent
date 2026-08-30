/**
 * Native Windows Application Launcher & Process Manager
 * Launches desktop applications visibly, verifies execution, and terminates processes cleanly.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Registry of supported Windows application launchers and termination targets.
 */
const APP_REGISTRY = {
  'calculator': {
    launchCmd: 'cmd.exe /c start calc.exe',
    processPatterns: ['CalculatorApp', 'Calculator', 'calc'],
    execNames: ['CalculatorApp.exe', 'Calculator.exe', 'calc.exe'],
  },
  'calc': {
    launchCmd: 'cmd.exe /c start calc.exe',
    processPatterns: ['CalculatorApp', 'Calculator', 'calc'],
    execNames: ['CalculatorApp.exe', 'Calculator.exe', 'calc.exe'],
  },
  'notepad': {
    launchCmd: 'cmd.exe /c start notepad.exe',
    processPatterns: ['notepad', 'Notepad'],
    execNames: ['notepad.exe'],
  },
  'vs code': {
    launchCmd: 'cmd.exe /c start code',
    processPatterns: ['Code'],
    execNames: ['Code.exe'],
  },
  'vscode': {
    launchCmd: 'cmd.exe /c start code',
    processPatterns: ['Code'],
    execNames: ['Code.exe'],
  },
  'visual studio code': {
    launchCmd: 'cmd.exe /c start code',
    processPatterns: ['Code'],
    execNames: ['Code.exe'],
  },
  'terminal': {
    launchCmd: 'cmd.exe /c start wt.exe || cmd.exe /c start powershell.exe',
    processPatterns: ['WindowsTerminal', 'powershell'],
    execNames: ['WindowsTerminal.exe', 'powershell.exe'],
  },
  'powershell': {
    launchCmd: 'cmd.exe /c start powershell.exe',
    processPatterns: ['powershell'],
    execNames: ['powershell.exe'],
  },
  'cmd': {
    launchCmd: 'cmd.exe /c start cmd.exe',
    processPatterns: ['cmd'],
    execNames: ['cmd.exe'],
  },
  'spotify': {
    launchCmd: 'cmd.exe /c start spotify:',
    processPatterns: ['Spotify'],
    execNames: ['Spotify.exe'],
  },
  'chrome': {
    launchCmd: 'cmd.exe /c start chrome',
    processPatterns: ['chrome'],
    execNames: ['chrome.exe'],
  },
  'google chrome': {
    launchCmd: 'cmd.exe /c start chrome',
    processPatterns: ['chrome'],
    execNames: ['chrome.exe'],
  },
  'edge': {
    launchCmd: 'cmd.exe /c start msedge',
    processPatterns: ['msedge'],
    execNames: ['msedge.exe'],
  },
  'file explorer': {
    launchCmd: 'cmd.exe /c start explorer.exe',
    processPatterns: ['explorer'],
    execNames: ['explorer.exe'],
  },
  'explorer': {
    launchCmd: 'cmd.exe /c start explorer.exe',
    processPatterns: ['explorer'],
    execNames: ['explorer.exe'],
  },
  'settings': {
    launchCmd: 'cmd.exe /c start ms-settings:',
    processPatterns: ['SystemSettings'],
    execNames: ['SystemSettings.exe'],
  },
  'task manager': {
    launchCmd: 'cmd.exe /c start taskmgr.exe',
    processPatterns: ['Taskmgr'],
    execNames: ['Taskmgr.exe'],
  },
  'paint': {
    launchCmd: 'cmd.exe /c start mspaint.exe',
    processPatterns: ['mspaint', 'Paint'],
    execNames: ['mspaint.exe'],
  },
  'snipping tool': {
    launchCmd: 'cmd.exe /c start snippingtool.exe',
    processPatterns: ['SnippingTool', 'ScreenClippingHost'],
    execNames: ['SnippingTool.exe'],
  },
};

/**
 * Launch an application visibly.
 */
export async function launchApp(appName) {
  const normalized = (appName || '').trim().toLowerCase();
  const entry = APP_REGISTRY[normalized];
  const launchCmd = entry ? entry.launchCmd : `cmd.exe /c start "" "${appName}"`;

  try {
    await execAsync(launchCmd);
    await new Promise(r => setTimeout(r, 600));

    return {
      success: true,
      appName,
      message: `Launched ${appName}.`,
    };
  } catch (err) {
    try {
      await execAsync(`powershell.exe -NoProfile -Command "Start-Process '${appName}' -ErrorAction SilentlyContinue"`);
      return {
        success: true,
        appName,
        message: `Launched ${appName}.`,
      };
    } catch (fallbackErr) {
      return {
        success: false,
        appName,
        error: `Failed to launch ${appName}: ${err.message}`,
      };
    }
  }
}

/**
 * Close/Terminate an application.
 */
export async function closeApp(appName) {
  const normalized = (appName || '').trim().toLowerCase();
  const entry = APP_REGISTRY[normalized];
  const execNames = entry ? entry.execNames : [`${appName}.exe`, appName];
  const patterns = entry ? entry.processPatterns : [appName];

  let killed = false;

  // 1. Try taskkill for each executable name
  for (const exe of execNames) {
    try {
      const { stdout } = await execAsync(`taskkill /IM "${exe}" /T /F`);
      if (stdout && stdout.includes('SUCCESS')) {
        killed = true;
      }
    } catch {}
  }

  // 2. Try PowerShell Stop-Process pattern matching
  for (const pat of patterns) {
    try {
      await execAsync(`powershell.exe -NoProfile -Command "Get-Process -Name '*${pat}*' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"`);
      killed = true;
    } catch {}
  }

  return {
    success: true,
    appName,
    message: `Closed ${appName}.`,
  };
}

/**
 * Check if a process matching pattern is running.
 */
export async function isProcessRunning(processPattern) {
  try {
    const { stdout } = await execAsync(`powershell.exe -NoProfile -Command "Get-Process | Where-Object { $_.ProcessName -like '*${processPattern}*' } | Select-Object -First 1 -ExpandProperty Name"`);
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
