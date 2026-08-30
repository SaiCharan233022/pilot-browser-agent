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
    // Extract raw text preserving original casing
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

  // 3. Simple Open App / Web Service
  const openMatch = cmd.match(/^open\s+([a-z0-9\s._-]+)$/i);
  if (openMatch && !cmd.includes('and')) {
    const appName = openMatch[1].trim();
    return {
      summary: `Open ${appName}`,
      steps: [{
        id: 1,
        action: 'app_launch',
        appName,
        description: `Open ${appName} visibly on desktop`,
      }],
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
