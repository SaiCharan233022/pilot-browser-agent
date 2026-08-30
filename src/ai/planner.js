/**
 * Task Planner — receives a user command and produces a structured execution plan.
 */

import { planTask as geminiPlan } from './gemini.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Create an execution plan from a natural language command.
 * @param {string} command - User's task description
 * @returns {Promise<Object>} - Complete task plan with metadata
 */
export async function createPlan(command) {
  const taskId = uuidv4();

  // 1. Check local deterministic fast-path for instant sub-millisecond execution
  const fastPlan = getFastPathPlan(command);
  const aiPlan = fastPlan || (await geminiPlan(command));

  // Normalize and validate the plan
  const plan = {
    taskId,
    command,
    summary: aiPlan.summary || 'Executing task...',
    steps: (aiPlan.steps || []).map((step, index) => ({
      id: step.id || index + 1,
      action: validateAction(step.action),
      mediaAction: step.mediaAction || null,
      appName: step.appName || null,
      key: step.key || null,
      url: step.url || null,
      selector: step.selector || null,
      text: step.text || null,
      direction: step.direction || null,
      amount: step.amount ?? null,
      description: step.description || `Step ${index + 1}`,
      sensitive: false, // Full autopilot - no approval pauses
      status: 'pending', // pending | running | completed | failed | skipped
      result: null,
      screenshot: null,
      timestamp: null,
    })),
    status: 'planned', // planned | running | completed | failed | cancelled
    createdAt: new Date().toISOString(),
    completedAt: null,
  };

  return plan;
}

const WEB_SERVICES = {
  'gemini': 'https://gemini.google.com',
  'gemini ai': 'https://gemini.google.com',
  'google gemini': 'https://gemini.google.com',
  'google gemini ai': 'https://gemini.google.com',
  'gamma': 'https://gamma.app',
  'gamma ai': 'https://gamma.app',
  'gamma.app': 'https://gamma.app',
  'youtube': 'https://www.youtube.com',
  'github': 'https://github.com',
  'chatgpt': 'https://chatgpt.com',
  'chatgpt ai': 'https://chatgpt.com',
  'perplexity': 'https://www.perplexity.ai',
  'perplexity ai': 'https://www.perplexity.ai',
  'claude': 'https://claude.ai',
  'claude ai': 'https://claude.ai',
  'deepseek': 'https://chat.deepseek.com',
  'deepseek ai': 'https://chat.deepseek.com',
  'huggingface': 'https://huggingface.co',
  'leetcode': 'https://leetcode.com',
  'canva': 'https://www.canva.com',
  'figma': 'https://www.figma.com',
  'notion': 'https://www.notion.so',
  'stackoverflow': 'https://stackoverflow.com',
  'wikipedia': 'https://www.wikipedia.org',
  'amazon': 'https://www.amazon.com',
  'flipkart': 'https://www.flipkart.com',
  'linkedin': 'https://www.linkedin.com',
  'google': 'https://www.google.com',
  'reddit': 'https://www.reddit.com',
  'instagram': 'https://www.instagram.com',
  'netflix': 'https://www.netflix.com',
  'gmail': 'https://mail.google.com',
  'twitter': 'https://x.com',
  'x': 'https://x.com',
};

const DESKTOP_APPS = [
  'notepad', 'calculator', 'calc', 'vs code', 'vscode', 'visual studio code',
  'terminal', 'powershell', 'cmd', 'paint', 'snipping tool', 'task manager',
  'file explorer', 'explorer', 'settings', 'spotify'
];

/**
 * Resolve any target name or string to a valid web URL.
 */
function resolveUrl(name) {
  if (!name) return 'https://www.google.com';
  let clean = name.trim().toLowerCase();
  if (WEB_SERVICES[clean]) return WEB_SERVICES[clean];
  if (clean.startsWith('http://') || clean.startsWith('https://')) return clean;

  const base = clean.replace(/\s+(ai|app|website|site|web)$/i, '').trim();
  if (WEB_SERVICES[base]) return WEB_SERVICES[base];

  if (/\.[a-z]{2,}(\/.*)?$/i.test(clean)) return `https://${clean}`;
  if (clean.endsWith(' ai')) return `https://${base}.ai`;
  const sanitized = clean.replace(/[^a-z0-9-]/g, '');
  return `https://www.${sanitized}.com`;
}

/**
 * High-speed local fast-path parser for system, volume, and desktop app actions.
 */
function getFastPathPlan(rawCmd) {
  if (!rawCmd) return null;
  const cmd = rawCmd.trim().toLowerCase();

  // 1. Compound Open and Play
  if (cmd.includes('open and play') || (cmd.includes('open') && cmd.includes('play') && cmd.includes('song'))) {
    return {
      summary: 'Open Spotify and play current song',
      steps: [{
        id: 1,
        action: 'open_and_play',
        appName: 'spotify',
        description: 'Open Spotify and trigger playback of active song',
      }],
    };
  }

  // 2. Open App and Write/Type Text (e.g. "open notepad and write Hello from Pilot AI")
  const openWriteMatch = cmd.match(/^open\s+([a-z\s]+?)\s+(?:and\s+)?(?:write|type)\s+(.+)$/i);
  if (openWriteMatch) {
    const targetApp = openWriteMatch[1].trim();
    const rawTextMatch = rawCmd.match(/^open\s+[a-z\s]+?\s+(?:and\s+)?(?:write|type)\s+(.+)$/i);
    const textToWrite = rawTextMatch ? rawTextMatch[1].trim() : openWriteMatch[2].trim();
    return {
      summary: `Open ${targetApp} and write text`,
      steps: [
        {
          id: 1,
          action: 'app_launch',
          appName: targetApp,
          description: `Open ${targetApp} application`,
        },
        {
          id: 2,
          action: 'desktop_type',
          appName: targetApp,
          text: textToWrite,
          description: `Type text into ${targetApp}`,
        },
      ],
    };
  }

  // 3. Open App or Web Service / Any Website
  const openMatch = cmd.match(/^open\s+([a-z0-9\s._:\/-]+)$/i);
  if (openMatch && !cmd.includes('and')) {
    const target = openMatch[1].trim();
    const targetLower = target.toLowerCase();

    // If it is a native desktop application
    if (DESKTOP_APPS.includes(targetLower)) {
      return {
        summary: `Open ${target}`,
        steps: [{
          id: 1,
          action: 'app_launch',
          appName: target,
          description: `Open ${target} visibly on desktop`,
        }],
      };
    }

    // Otherwise it is a Website / Web Service / AI Platform / Custom URL
    const targetUrl = resolveUrl(target);
    return {
      summary: `Open ${target} (${targetUrl})`,
      steps: [
        {
          id: 1,
          action: 'navigate',
          url: targetUrl,
          description: `Open ${target} in browser (${targetUrl})`,
        },
      ],
    };
  }

  // 4. Close App
  const closeMatch = cmd.match(/^close\s+([a-z0-9\s._-]+)$/i);
  if (closeMatch) {
    const appName = closeMatch[1].trim();
    return {
      summary: `Close ${appName}`,
      steps: [{
        id: 1,
        action: 'app_close',
        appName,
        description: `Close ${appName} application`,
      }],
    };
  }

  // 5. Volume Set
  const volMatch = cmd.match(/(?:set\s+)?volume\s+(?:to\s+)?(\d+)\s*%?/i);
  if (volMatch) {
    const amount = parseInt(volMatch[1], 10);
    return {
      summary: `Set volume to ${amount}%`,
      steps: [{
        id: 1,
        action: 'media_control',
        mediaAction: 'set_volume',
        amount,
        description: `Set system volume to ${amount}%`,
      }],
    };
  }

  // 6. Media Controls
  if (cmd === 'pause' || cmd === 'pause song' || cmd === 'pause music' || cmd === 'stop music' || cmd === 'stop song') {
    return {
      summary: 'Pause media playback',
      steps: [{
        id: 1,
        action: 'media_control',
        mediaAction: 'pause',
        description: 'Pause playback',
      }],
    };
  }
  if (cmd === 'play' || cmd === 'resume' || cmd === 'resume song' || cmd === 'play again') {
    return {
      summary: 'Resume media playback',
      steps: [{
        id: 1,
        action: 'media_control',
        mediaAction: 'play',
        description: 'Resume playback',
      }],
    };
  }
  if (cmd === 'next' || cmd === 'next song' || cmd === 'next track') {
    return {
      summary: 'Skip to next track',
      steps: [{
        id: 1,
        action: 'media_control',
        mediaAction: 'next',
        description: 'Next track',
      }],
    };
  }
  if (cmd === 'prev' || cmd === 'previous' || cmd === 'previous song' || cmd === 'previous track') {
    return {
      summary: 'Go to previous track',
      steps: [{
        id: 1,
        action: 'media_control',
        mediaAction: 'previous',
        description: 'Previous track',
      }],
    };
  }
  if (cmd === 'mute') {
    return {
      summary: 'Mute system audio',
      steps: [{
        id: 1,
        action: 'media_control',
        mediaAction: 'mute',
        description: 'Mute audio',
      }],
    };
  }
  if (cmd === 'unmute') {
    return {
      summary: 'Unmute system audio',
      steps: [{
        id: 1,
        action: 'media_control',
        mediaAction: 'unmute',
        description: 'Unmute audio',
      }],
    };
  }

  return null;
}

/**
 * Validate an action type, falling back to extract_text for unknown actions.
 */
function validateAction(action) {
  const validActions = [
    'media_control', 'app_launch', 'app_close', 'open_and_play',
    'desktop_focus', 'desktop_type', 'desktop_key',
    'navigate', 'click', 'type', 'screenshot_and_extract',
    'scroll', 'wait', 'select', 'extract_text', 'go_back',
  ];
  if (validActions.includes(action)) return action;
  return 'extract_text';
}
