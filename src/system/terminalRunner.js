/**
 * Pilot Safe Terminal & Command Execution Tool
 * Executes system shell commands, scripts, and developer tools safely.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const BLOCKED_COMMANDS = [
  'format c:',
  'rmdir /s /q c:\\windows',
  'del /f /s /q c:\\windows',
  ':(){ :|:& };:',
];

/**
 * Execute a terminal command with output capture and timeout.
 */
export async function executeTerminalCommand(command, { cwd = process.cwd(), timeout = 25000 } = {}) {
  const cleanCmd = (command || '').trim();
  if (!cleanCmd) {
    return { success: false, error: 'Empty command string.' };
  }

  // Safety check
  const lower = cleanCmd.toLowerCase();
  for (const blocked of BLOCKED_COMMANDS) {
    if (lower.includes(blocked)) {
      return { success: false, error: `Command blocked for safety: "${cleanCmd}"` };
    }
  }

  try {
    const { stdout, stderr } = await execAsync(cleanCmd, {
      cwd,
      timeout,
      maxBuffer: 5 * 1024 * 1024,
      env: { ...process.env, PAGER: 'cat' },
    });

    const output = (stdout || '').trim() || (stderr || '').trim() || '(Command completed with no output)';

    return {
      success: true,
      command: cleanCmd,
      output,
      cwd,
    };
  } catch (err) {
    return {
      success: false,
      command: cleanCmd,
      error: err.message,
      stdout: (err.stdout || '').trim(),
      stderr: (err.stderr || '').trim(),
    };
  }
}
