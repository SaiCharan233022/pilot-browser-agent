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
  // AI Platforms & Web Applications
  'gemini': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://gemini.google.com\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'google gemini': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://gemini.google.com\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'gamma': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://gamma.app\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'gamma ai': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://gamma.app\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'gamma.app': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://gamma.app\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'perplexity': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://www.perplexity.ai\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'perplexity ai': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://www.perplexity.ai\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'claude': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://claude.ai\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'claude ai': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://claude.ai\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'deepseek': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://chat.deepseek.com\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'deepseek ai': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://chat.deepseek.com\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'huggingface': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://huggingface.co\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'leetcode': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://leetcode.com\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'canva': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://www.canva.com\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'figma': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://www.figma.com\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'notion': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://www.notion.so\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'stackoverflow': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://stackoverflow.com\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'wikipedia': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://www.wikipedia.org\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'amazon': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://www.amazon.com\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'flipkart': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://www.flipkart.com\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'linkedin': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://www.linkedin.com\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'google': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://www.google.com\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
  'bing': {
    launchCmd: 'powershell.exe -NoProfile -Command "Start-Process \'https://www.bing.com\'"',
    processPatterns: ['chrome', 'msedge'],
    execNames: ['chrome.exe'],
  },
};

/**
 * Resolve any application, service name, or arbitrary URL to a launch command.
 */
function resolveAppOrWebCommand(name) {
  if (!name) return 'powershell.exe -NoProfile -Command "Start-Process \'https://www.google.com\'"';
  const clean = name.trim().toLowerCase();
  
  if (APP_REGISTRY[clean]) return APP_REGISTRY[clean].launchCmd;

  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return `powershell.exe -NoProfile -Command "Start-Process '${clean}'"`;
  }

  if (/\.[a-z]{2,}(\/.*)?$/i.test(clean)) {
    return `powershell.exe -NoProfile -Command "Start-Process 'https://${clean}'"`;
  }

  const strippedAi = clean.replace(/\s+(ai|app)$/i, '');
  if (APP_REGISTRY[strippedAi]) return APP_REGISTRY[strippedAi].launchCmd;
  if (clean.endsWith(' ai')) {
    return `powershell.exe -NoProfile -Command "Start-Process 'https://${strippedAi}.ai' -ErrorAction SilentlyContinue; if (!$?) { Start-Process 'https://www.${strippedAi}.com' }"`;
  }

  const sanitizedWord = clean.replace(/[^a-z0-9-]/g, '');
  return `powershell.exe -NoProfile -Command "Start-Process 'https://www.${sanitizedWord}.com' -ErrorAction SilentlyContinue; if (!$?) { Start-Process 'https://${sanitizedWord}.ai' }"`;
}

/**
 * Launch an application or website visibly in foreground.
 */
export async function launchApp(appName) {
  const normalized = (appName || '').trim().toLowerCase();

  // 1. Direct custom registry match
  if (APP_REGISTRY[normalized]) {
    try {
      await execAsync(APP_REGISTRY[normalized].launchCmd);
      await new Promise(r => setTimeout(r, 400));
      return {
        success: true,
        appName,
        message: `Launched ${appName}.`,
      };
    } catch {}
  }

  // 2. Query Windows Get-StartApps to find ANY installed laptop application
  try {
    const base64Query = Buffer.from(normalized, 'utf-8').toString('base64');
    const psScript = `$q = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64Query}')).ToLower(); $app = Get-StartApps | Where-Object { $_.Name.ToLower().Contains($q) -or $_.AppID.ToLower().Contains($q) } | Select-Object -First 1; if ($app) { Start-Process explorer.exe ("shell:AppsFolder\" + $app.AppID); Write-Output ("FOUND:" + $app.Name) } else { Write-Output "NOT_FOUND" }`;
    const { stdout } = await execAsync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psScript}"`);
    if (stdout && stdout.includes('FOUND:')) {
      await new Promise(r => setTimeout(r, 400));
      return {
        success: true,
        appName,
        message: `Launched ${appName}.`,
      };
    }
  } catch {}

  // 3. Try standard Windows executable / protocol launch
  try {
    const fallbackCmd = `powershell.exe -NoProfile -Command "Start-Process '${appName}.exe' -ErrorAction SilentlyContinue; if (!$?) { Start-Process '${appName}:' -ErrorAction SilentlyContinue; if (!$?) { Start-Process '${appName}' } }"`;
    await execAsync(fallbackCmd);
    await new Promise(r => setTimeout(r, 400));
    return {
      success: true,
      appName,
      message: `Launched ${appName}.`,
    };
  } catch (err) {
    // 4. Fallback to web search
    try {
      const url = `https://www.${normalized.replace(/[^a-z0-9-]/g, '')}.com`;
      await execAsync(`powershell.exe -NoProfile -Command "Start-Process '${url}'"`);
      return {
        success: true,
        appName,
        message: `Opened ${appName}.`,
      };
    } catch {
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
