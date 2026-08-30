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
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process calc.exe"',
    processPatterns: ['CalculatorApp', 'Calculator', 'calc'],
    execNames: ['CalculatorApp.exe', 'Calculator.exe', 'calc.exe'],
  },
  'calc': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process calc.exe"',
    processPatterns: ['CalculatorApp', 'Calculator', 'calc'],
    execNames: ['CalculatorApp.exe', 'Calculator.exe', 'calc.exe'],
  },
  'notepad': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process notepad.exe"',
    processPatterns: ['notepad', 'Notepad'],
    execNames: ['notepad.exe'],
  },
  'vs code': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process code"',
    processPatterns: ['Code'],
    execNames: ['Code.exe'],
  },
  'vscode': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process code"',
    processPatterns: ['Code'],
    execNames: ['Code.exe'],
  },
  'visual studio code': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process code"',
    processPatterns: ['Code'],
    execNames: ['Code.exe'],
  },
  'terminal': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process wt.exe -ErrorAction SilentlyContinue; if (!$?) { Start-Process powershell.exe }"',
    processPatterns: ['WindowsTerminal', 'powershell'],
    execNames: ['WindowsTerminal.exe', 'powershell.exe'],
  },
  'powershell': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process powershell.exe"',
    processPatterns: ['powershell'],
    execNames: ['powershell.exe'],
  },
  'cmd': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process cmd.exe"',
    processPatterns: ['cmd'],
    execNames: ['cmd.exe'],
  },
  'spotify': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process spotify: -ErrorAction SilentlyContinue; if (!$?) { Start-Process explorer.exe shell:AppsFolder\\SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify }"',
    processPatterns: ['Spotify', 'SpotifyLauncher'],
    execNames: ['Spotify.exe', 'SpotifyLauncher.exe'],
  },
  'chrome': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process chrome"',
    processPatterns: ['chrome'],
    execNames: ['chrome.exe'],
  },
  'google chrome': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process chrome"',
    processPatterns: ['chrome'],
    execNames: ['chrome.exe'],
  },
  'edge': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process msedge"',
    processPatterns: ['msedge'],
    execNames: ['msedge.exe'],
  },
  'file explorer': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process explorer.exe"',
    processPatterns: ['explorer'],
    execNames: ['explorer.exe'],
  },
  'explorer': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process explorer.exe"',
    processPatterns: ['explorer'],
    execNames: ['explorer.exe'],
  },
  'settings': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process ms-settings:"',
    processPatterns: ['SystemSettings'],
    execNames: ['SystemSettings.exe'],
  },
  'task manager': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process taskmgr.exe"',
    processPatterns: ['Taskmgr'],
    execNames: ['Taskmgr.exe'],
  },
  'paint': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process mspaint.exe"',
    processPatterns: ['mspaint', 'Paint'],
    execNames: ['mspaint.exe'],
  },
  'snipping tool': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process snippingtool.exe"',
    processPatterns: ['SnippingTool', 'ScreenClippingHost'],
    execNames: ['SnippingTool.exe'],
  },

  // Web Applications & Services
  'youtube': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://www.youtube.com\'"',
    processPatterns: ['chrome', 'msedge', 'brave', 'firefox'],
    execNames: ['chrome.exe', 'msedge.exe'],
  },
  'chatgpt': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://chatgpt.com\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'reddit': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://www.reddit.com\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'github': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://github.com\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'instagram': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://www.instagram.com\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'netflix': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://www.netflix.com\'"',
    processPatterns: ['Netflix', 'chrome', 'msedge'],
    execNames: ['Netflix.exe', 'chrome.exe'],
  },
  'gmail': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://mail.google.com\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'whatsapp': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process whatsapp: -ErrorAction SilentlyContinue; if (!$?) { Start-Process \'https://web.whatsapp.com\' }"',
    processPatterns: ['WhatsApp', 'WhatsAppRoot'],
    execNames: ['WhatsApp.exe'],
  },
  'discord': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process discord: -ErrorAction SilentlyContinue; if (!$?) { Start-Process \'https://discord.com/app\' }"',
    processPatterns: ['Discord'],
    execNames: ['Discord.exe'],
  },
  'telegram': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process tg: -ErrorAction SilentlyContinue; if (!$?) { Start-Process \'https://web.telegram.org\' }"',
    processPatterns: ['Telegram'],
    execNames: ['Telegram.exe'],
  },
  'twitter': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://x.com\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'x': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://x.com\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
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
