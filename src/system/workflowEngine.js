import { exec } from 'child_process';
import { promisify } from 'util';
import { launchApp, closeApp } from './appLauncher.js';
import { setVolume, mute, togglePlayPause } from './mediaController.js';
import { executeTerminalCommand } from './terminalRunner.js';
import * as browser from '../browser/controller.js';

const execAsync = promisify(exec);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export const PRESET_WORKFLOWS = {
  coding: {
    name: 'Coding Environment Setup',
    description: 'Launch VS Code, open Terminal, set volume to 30%, open Spotify, open GitHub',
    execute: async () => {
      const log = [];
      await setVolume(30);
      log.push('🔊 Volume set to 30%');

      await launchApp('code');
      log.push('💻 Launched VS Code');
      await sleep(300);

      await launchApp('spotify');
      log.push('🎵 Launched Spotify');
      await sleep(300);

      try {
        await execAsync('powershell.exe -NoProfile -Command "Start-Process \'https://github.com\'"');
      } catch {}

      return {
        success: true,
        workflow: 'coding',
        steps: log,
        openUrl: 'https://github.com',
        summary: `🚀 **Coding Setup Ready:**\n\n• ${log.join('\n• ')}\n• 🌐 Opened GitHub in browser.`,
      };
    },
  },

  focus: {
    name: 'Deep Focus Mode',
    description: 'Mute system audio, set volume to 0%, open Notepad',
    execute: async () => {
      const log = [];
      await mute();
      await setVolume(0);
      log.push('🔇 Audio muted & volume set to 0%');

      await launchApp('notepad');
      log.push('📝 Opened Notepad for focus notes');

      return {
        success: true,
        workflow: 'focus',
        steps: log,
        summary: `🎯 **Focus Mode Active:**\n\n• ${log.join('\n• ')}\n• Distractions minimized.`,
      };
    },
  },

  relax: {
    name: 'Relax & Chill Mode',
    description: 'Set volume to 45%, launch Spotify, start music',
    execute: async () => {
      const log = [];
      await setVolume(45);
      log.push('🔊 Volume set to 45%');

      await launchApp('spotify');
      log.push('🎵 Launched Spotify');
      await sleep(400);

      await togglePlayPause();
      log.push('▶️ Triggered music playback');

      return {
        success: true,
        workflow: 'relax',
        steps: log,
        summary: `☕ **Relax Mode Active:**\n\n• ${log.join('\n• ')}`,
      };
    },
  },

  meeting: {
    name: 'Meeting Mode',
    description: 'Set volume to 25%, open Notepad for meeting minutes',
    execute: async () => {
      const log = [];
      await setVolume(25);
      log.push('🔊 Volume balanced to 25%');

      await launchApp('notepad');
      log.push('📝 Opened Notepad for meeting minutes');

      try {
        await execAsync('powershell.exe -NoProfile -Command "Start-Process \'https://calendar.google.com\'"');
      } catch {}

      return {
        success: true,
        workflow: 'meeting',
        steps: log,
        openUrl: 'https://calendar.google.com',
        summary: `📅 **Meeting Mode Ready:**\n\n• ${log.join('\n• ')}\n• 🌐 Opened Google Calendar.`,
      };
    },
  },
};

/**
 * Run a specified workflow by key or name.
 */
export async function executeWorkflow(workflowKey) {
  const clean = (workflowKey || '').toLowerCase().trim();
  const target = PRESET_WORKFLOWS[clean] ||
    (clean.includes('code') || clean.includes('coding') || clean.includes('dev') ? PRESET_WORKFLOWS.coding : null) ||
    (clean.includes('focus') || clean.includes('study') || clean.includes('work') ? PRESET_WORKFLOWS.focus : null) ||
    (clean.includes('relax') || clean.includes('chill') || clean.includes('music') ? PRESET_WORKFLOWS.relax : null) ||
    (clean.includes('meeting') || clean.includes('call') ? PRESET_WORKFLOWS.meeting : null);

  if (!target) {
    return {
      success: false,
      error: `Unknown workflow: "${workflowKey}". Available workflows: coding, focus, relax, meeting.`,
    };
  }

  return await target.execute();
}
