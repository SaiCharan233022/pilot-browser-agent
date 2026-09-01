/**
 * Task Planner — receives a user command and produces a structured execution plan.
 */

import { planTask as geminiPlan } from './gemini.js';
import { v4 as uuidv4 } from 'uuid';
import { getLastActiveTarget } from '../storage/memory.js';
import { findInstalledAppSync } from '../system/appLauncher.js';

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
      command: step.command || null,
      prompt: step.prompt || null,
      mediaAction: step.mediaAction || null,
      appName: step.appName || null,
      workflow: step.workflow || null,
      key: step.key || null,
      content: step.content || null,
      query: step.query || null,
      pattern: step.pattern || null,
      baseDirQuery: step.baseDirQuery || null,
      filePath: step.filePath || null,
      dirQuery: step.dirQuery || null,
      targetName: step.targetName || null,
      url: step.url || null,
      selector: step.selector || null,
      text: step.text || null,
      direction: step.direction || null,
      amount: step.amount ?? null,
      description: step.description || `Step ${index + 1}`,
      sensitive: false, // Full autopilot - no approval pauses
      status: 'pending',
      result: null,
      screenshot: null,
      timestamp: null,
    })),
    status: 'planned',
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
  'geeksforgeeks': 'https://www.geeksforgeeks.org',
  'gfg': 'https://www.geeksforgeeks.org',
  'cricbuzz': 'https://www.cricbuzz.com',
  'hotstar': 'https://www.hotstar.com',
  'prime video': 'https://www.primevideo.com',
  'quora': 'https://www.quora.com',
  'medium': 'https://medium.com',
  'coursera': 'https://www.coursera.org',
  'udemy': 'https://www.udemy.com',
  'pinterest': 'https://www.pinterest.com',
  'twitch': 'https://www.twitch.tv',
};

const DESKTOP_APPS = [
  'notepad', 'calculator', 'calc', 'vs code', 'vscode', 'visual studio code',
  'terminal', 'powershell', 'cmd', 'paint', 'snipping tool', 'task manager',
  'file explorer', 'explorer', 'settings', 'spotify', 'autocad', 'armoury crate',
  'word', 'excel', 'powerpoint', 'vlc', 'steam', 'taskmgr'
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
 * High-speed local fast-path parser for system, memory, filesystem, and desktop actions.
 */
function getFastPathPlan(rawCmd) {
  if (!rawCmd) return null;
  const cmd = rawCmd.trim();
  const lower = cmd.toLowerCase();

  // 1. Compound Open and Play
  if (lower.includes('open and play') || (lower.includes('open') && lower.includes('play') && lower.includes('song'))) {
    return {
      summary: 'Open Spotify and play current song',
      steps: [{
        id: 1,
        action: 'open_and_play',
        appName: 'spotify',
        description: 'Launch Spotify and trigger playback',
      }],
    };
  }

  // 2. Notepad automation with typing
  const notepadMatch = lower.match(/(?:open|start|launch)\s+notepad\s+(?:and\s+write|and\s+type|write|type)\s+(.+)/i);
  if (notepadMatch) {
    const textToWrite = cmd.slice(cmd.toLowerCase().indexOf(notepadMatch[1].toLowerCase())).trim();
    return {
      summary: `Open Notepad and type: "${textToWrite}"`,
      steps: [
        {
          id: 1,
          action: 'app_launch',
          appName: 'notepad',
          description: 'Launch Notepad application',
        },
        {
          id: 2,
          action: 'desktop_type',
          appName: 'notepad',
          text: textToWrite,
          description: `Type text into Notepad`,
        },
      ],
    };
  }

  // 3. Knowledge Memory: Remember
  const remMatch = lower.match(/^remember(?:\s+that)?\s+(?:my\s+)?([^:]+?)(?:\s+is|\s+as|\s*:\s*)\s*(.+)$/i);
  if (remMatch) {
    const key = remMatch[1].trim();
    const content = remMatch[2].trim();
    return {
      summary: `Remember that ${key} is ${content}`,
      steps: [{
        id: 1,
        action: 'remember_fact',
        key,
        content,
        description: `Save knowledge fact: ${key}`,
      }],
    };
  }
  const noteMatch = lower.match(/^(?:save\s+note|remember|take\s+a\s+note)\s*:\s*(.+)$/i);
  if (noteMatch) {
    const noteText = noteMatch[1].trim();
    return {
      summary: `Save note: "${noteText}"`,
      steps: [{
        id: 1,
        action: 'remember_fact',
        key: 'note_' + Date.now().toString().slice(-4),
        content: noteText,
        description: `Save user note`,
      }],
    };
  }

  // 4. Knowledge Memory: Recall
  if (
    lower.match(/^what\s+is\s+my\s+([^?]+)/i) ||
    lower.match(/^recall\s+([^?]+)/i) ||
    lower.match(/^what\s+do\s+you\s+remember(?:\s+about\s+me)?/i) ||
    lower.match(/^(?:show|list|get)\s+(?:my\s+)?(?:knowledge|notes|facts|preferences|saved\s+facts)/i)
  ) {
    const keyMatch = lower.match(/^(?:what\s+is\s+my|recall)\s+([^?]+)/i);
    const key = keyMatch ? keyMatch[1].trim() : null;
    return {
      summary: key ? `Recall knowledge for "${key}"` : 'Retrieve all stored knowledge and preferences',
      steps: [{
        id: 1,
        action: 'recall_knowledge',
        key,
        description: key ? `Query knowledge key: ${key}` : 'List all stored knowledge facts',
      }],
    };
  }

  // 5. Input History Queries (Continuous conversation memory)
  if (
    lower.match(/^what\s+did\s+i\s+(?:ask|say|type|command|tell\s+you)(?:\s+earlier|\s+before|\s+previously)?/i) ||
    lower.match(/^what\s+was\s+my\s+last\s+(?:command|input|message|query|task)/i) ||
    lower.match(/^(?:show|list|get)\s+(?:my\s+)?(?:input\s+history|chat\s+history|all\s+inputs|recent\s+inputs|inputs)/i)
  ) {
    return {
      summary: 'Retrieve your recent input and conversation history',
      steps: [{
        id: 1,
        action: 'history_query',
        limit: 15,
        description: 'Query stored conversation inputs',
      }],
    };
  }
  const searchHistMatch = lower.match(/^search\s+history\s+(?:for\s+)?(.+)$/i);
  if (searchHistMatch) {
    const q = searchHistMatch[1].trim();
    return {
      summary: `Search conversation history for "${q}"`,
      steps: [{
        id: 1,
        action: 'history_query',
        query: q,
        description: `Search history for ${q}`,
      }],
    };
  }

  // 6. Knowledge Memory: Forget
  const forgetMatch = lower.match(/^(?:forget|delete\s+note|remove\s+knowledge)\s+(?:my\s+)?([^?]+)/i);
  if (forgetMatch) {
    const key = forgetMatch[1].trim();
    return {
      summary: `Forget knowledge fact "${key}"`,
      steps: [{
        id: 1,
        action: 'forget_fact',
        key,
        description: `Delete knowledge key: ${key}`,
      }],
    };
  }

  // 6. Filesystem: Search Files
  const searchMatch = lower.match(/(?:find|search(?:\s+for)?)\s+files?(?:\s+named|\s+with\s+name)?\s+([^\s]+)(?:\s+in\s+([a-z0-9_.-]+))?/i);
  if (searchMatch) {
    const pattern = searchMatch[1].trim();
    const baseDir = (searchMatch[2] || 'project').trim();
    return {
      summary: `Search for files named "${pattern}" in ${baseDir}`,
      steps: [{
        id: 1,
        action: 'file_search',
        pattern,
        baseDirQuery: baseDir,
        description: `Search files matching ${pattern} in ${baseDir}`,
      }],
    };
  }

  // 7. Filesystem: Read File
  const readMatch = lower.match(/(?:read|show|view|display)(?:\s+the\s+contents\s+of)?(?:\s+file)?\s+([a-z0-9_./\\-]+\.[a-z0-9]+)/i);
  if (readMatch) {
    const filePath = readMatch[1].trim();
    return {
      summary: `Read file: ${filePath}`,
      steps: [{
        id: 1,
        action: 'file_read',
        filePath,
        description: `Read file contents of ${filePath}`,
      }],
    };
  }

  // 8. Filesystem: Create / Write File
  const writeMatch = rawCmd.match(/^(?:create\s+file|write(?:\s+to)?\s+file|save(?:\s+to)?\s+file)\s+([a-z0-9_./\\-]+\.[a-z0-9]+)\s+(?:with\s+content|with\s+text|containing|:)\s*([\s\S]+)$/i);
  if (writeMatch) {
    const filePath = writeMatch[1].trim();
    const content = writeMatch[2].trim();
    return {
      summary: `Create file "${filePath}" with specified content`,
      steps: [{
        id: 1,
        action: 'file_write',
        filePath,
        content,
        description: `Write content to ${filePath}`,
      }],
    };
  }

  // 9. Filesystem: List Directory
  const listMatch = lower.match(/(?:list|show)\s+(?:all\s+)?files(?:\s+in\s+(?:the\s+)?([a-z0-9_./\\-]+))?/i);
  if (listMatch) {
    const dirQuery = (listMatch[1] || 'project').trim();
    return {
      summary: `List files in ${dirQuery}`,
      steps: [{
        id: 1,
        action: 'file_list',
        dirQuery,
        description: `List directory contents of ${dirQuery}`,
      }],
    };
  }

  // 10. Desktop Screen Perception & Vision Inspection
  if (
    lower.match(/^(?:what\s+is\s+on\s+my\s+screen|inspect\s+(?:my\s+)?screen|look\s+at\s+my\s+screen|what\s+is\s+on\s+desktop|summarize\s+(?:my\s+)?screen|take\s+a\s+screenshot)/i)
  ) {
    return {
      summary: 'Inspect and analyze your screen with Gemini Vision',
      steps: [{
        id: 1,
        action: 'desktop_screen_inspect',
        prompt: rawCmd,
        description: 'Capture screen and analyze with Gemini Vision',
      }],
    };
  }

  // 11. Safe Terminal & Command Execution
  const termMatch = lower.match(/^(?:run\s+command|execute\s+command|run\s+terminal|execute|run)\s+(.+)$/i);
  if (termMatch && !lower.startsWith('open ') && !lower.startsWith('launch ') && !lower.startsWith('start ') && !lower.startsWith('play ') && !lower.startsWith('set ') && !lower.startsWith('find ') && !lower.startsWith('read ') && !lower.startsWith('list ') && !lower.startsWith('create ') && !lower.startsWith('write ')) {
    let commandToRun = rawCmd.slice(rawCmd.toLowerCase().indexOf(termMatch[1].toLowerCase())).trim();
    commandToRun = commandToRun.replace(/^[`"']+|[`"']+$/g, '');
    return {
      summary: `Execute terminal command: "${commandToRun}"`,
      steps: [{
        id: 1,
        action: 'terminal_command',
        command: commandToRun,
        description: `Run shell command: ${commandToRun}`,
      }],
    };
  }

  // 12. Unified Document Intelligence (PDF, CSV, TSV, JSON, TXT)
  const docMatch = lower.match(/(?:read|summarize|parse|extract(?:\s+data|\s+text\s+from)?)(?:\s+(?:document|spreadsheet|table|csv|tsv|json|pdf))?\s+([a-z0-9_./\\-]+\.(?:pdf|csv|tsv|json|txt|md|log))/i);
  if (docMatch) {
    const docPath = docMatch[1].trim();
    return {
      summary: `Parse and extract document: ${docPath}`,
      steps: [{
        id: 1,
        action: 'document_read',
        filePath: docPath,
        description: `Parse and summarize document ${docPath}`,
      }],
    };
  }

  // 13. Compound Multi-Step Workflows
  if (
    lower.match(/^(?:start\s+|prepare\s+|trigger\s+|run\s+)?(?:coding\s+mode|coding\s+setup|developer\s+mode|dev\s+setup)/i) ||
    lower.match(/^(?:start\s+|trigger\s+|enable\s+)?(?:focus\s+mode|deep\s+focus|study\s+mode)/i) ||
    lower.match(/^(?:start\s+|trigger\s+|enable\s+)?(?:relax\s+mode|chill\s+mode|relax)/i) ||
    lower.match(/^(?:start\s+|prepare\s+)?(?:meeting\s+mode|call\s+mode)/i)
  ) {
    let wf = 'coding';
    if (lower.includes('focus') || lower.includes('study')) wf = 'focus';
    else if (lower.includes('relax') || lower.includes('chill')) wf = 'relax';
    else if (lower.includes('meeting') || lower.includes('call')) wf = 'meeting';

    return {
      summary: `Execute ${wf} workflow`,
      steps: [{
        id: 1,
        action: 'workflow_execute',
        workflow: wf,
        description: `Run ${wf} routine`,
      }],
    };
  }

  // 14. System Hardware & Health Queries
  if (
    lower === 'battery' || lower === 'battery status' || lower === 'battery percentage' ||
    lower === 'check battery' || lower === 'how much battery' || lower === 'what is the battery'
  ) {
    return {
      summary: 'Check laptop battery status',
      steps: [{
        id: 1,
        action: 'battery_status',
        description: 'Query battery charge and power state',
      }],
    };
  }

  if (
    lower === 'system info' || lower === 'system status' || lower === 'hardware status' ||
    lower === 'check ram' || lower === 'check memory' || lower === 'check cpu' || lower === 'specs' ||
    lower === 'system health' || lower === 'check system' || lower === 'pc status'
  ) {
    return {
      summary: 'Query system hardware, memory, CPU, and disk health',
      steps: [{
        id: 1,
        action: 'system_info',
        description: 'Query hardware utilization metrics',
      }],
    };
  }

  // 15. Deep Multi-Source Web Research
  const researchMatch = lower.match(/^(?:deep\s+research|research\s+in\s+depth|conduct\s+research\s+on|in-depth\s+research\s+on)\s+(.+)$/i);
  if (researchMatch) {
    const topic = researchMatch[1].trim();
    return {
      summary: `Conduct deep multi-source research on "${topic}"`,
      steps: [{
        id: 1,
        action: 'deep_research',
        query: topic,
        description: `Research ${topic}`,
      }],
    };
  }

  // 16. Clipboard Read & Write
  const copyClipMatch = rawCmd.match(/^(?:copy\s+to\s+clipboard|set\s+clipboard(?:\s+to)?)\s*[:]?\s*(.+)$/i);
  if (copyClipMatch) {
    const textToCopy = copyClipMatch[1].trim();
    return {
      summary: `Copy text to clipboard: "${textToCopy}"`,
      steps: [{
        id: 1,
        action: 'clipboard_set',
        content: textToCopy,
        description: 'Copy text to clipboard',
      }],
    };
  }

  if (lower === 'clipboard' || lower === 'get clipboard' || lower === 'read clipboard' || lower === 'what is on clipboard' || lower === 'show clipboard') {
    return {
      summary: 'Read system clipboard content',
      steps: [{
        id: 1,
        action: 'clipboard_get',
        description: 'Read clipboard',
      }],
    };
  }

  // 17. Window Switching
  const switchMatch = lower.match(/^(?:switch\s+to|bring\s+to\s+front|focus\s+window)\s+(.+)$/i);
  if (switchMatch && !lower.startsWith('open ') && !lower.startsWith('launch ')) {
    const targetApp = switchMatch[1].trim();
    return {
      summary: `Switch to ${targetApp} window`,
      steps: [{
        id: 1,
        action: 'window_switch',
        appName: targetApp,
        description: `Bring ${targetApp} to foreground`,
      }],
    };
  }

  // 9. Unified Open / Launch System
  const openMatch = lower.match(/^(?:open|launch|start)(?:\s+(?:the|app|my|up))?\s+(.+)$/i);
  if (openMatch) {
    const target = openMatch[1].trim();

    // 1. Explicit URLs
    if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('www.') || target.includes('.com') || target.includes('.org') || target.includes('.net') || target.includes('.io') || target.includes('.app') || target.includes('.to') || target.includes('.ge') || target.includes('.tv')) {
      const targetUrl = resolveUrl(target);
      return {
        summary: `Open ${target}`,
        steps: [{
          id: 1,
          action: 'navigate',
          targetName: target,
          url: targetUrl,
          description: `Open ${target} directly on screen`,
        }],
      };
    }

    // 2. Installed LAPTOP APPS
    const appMatch = findInstalledAppSync(target);
    const isKnownDesktop = DESKTOP_APPS.includes(target) || appMatch !== null;

    if (isKnownDesktop) {
      return {
        summary: `Open ${target}`,
        steps: [{
          id: 1,
          action: 'app_launch',
          appName: target,
          description: `Launch ${target} on your laptop`,
        }],
      };
    }

    // 3. Otherwise it is a WEBSITE ON THE INTERNET
    const targetUrl = resolveUrl(target);
    return {
      summary: `Open ${target}`,
      steps: [{
        id: 1,
        action: 'navigate',
        targetName: target,
        url: targetUrl,
        description: `Open ${target} directly on screen`,
      }],
    };
  }

  // 10. Close App / Close It / Close Active
  const closeMatch = lower.match(/^close(?:\s+([a-z0-9\s._-]+))?$/i);
  if (closeMatch) {
    const appName = (closeMatch[1] || 'it').trim();
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

  // 11. Volume Set
  const volMatch = lower.match(/(?:set\s+)?volume\s+(?:to\s+)?(\d+)\s*%?/i);
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

  // 12. Media Controls
  if (lower === 'pause' || lower === 'pause song' || lower === 'pause music' || lower === 'stop music' || lower === 'stop song') {
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
  if (lower === 'play' || lower === 'resume' || lower === 'resume song' || lower === 'play again') {
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
  if (lower === 'next' || lower === 'next song' || lower === 'next track') {
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
  if (lower === 'prev' || lower === 'previous' || lower === 'previous song' || lower === 'previous track') {
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
  if (lower === 'mute') {
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
  if (lower === 'unmute') {
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

  // 13. Media and Volume Status Queries
  if (
    lower === 'what song is playing' ||
    lower === 'what is playing' ||
    lower === 'current song' ||
    lower === 'media status' ||
    lower === 'check media' ||
    lower === 'audio status' ||
    lower === 'volume status' ||
    lower === 'what is the volume' ||
    lower === 'check volume'
  ) {
    return {
      summary: 'Check system volume and active media',
      steps: [{
        id: 1,
        action: 'media_status',
        description: 'Query active media session and master volume level',
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
    'media_control', 'media_status', 'app_launch', 'app_close', 'open_and_play',
    'desktop_focus', 'desktop_type', 'desktop_key',
    'remember_fact', 'recall_knowledge', 'forget_fact', 'history_query',
    'file_search', 'file_read', 'file_write', 'file_list', 'pdf_read', 'document_read',
    'desktop_screen_inspect', 'terminal_command',
    'workflow_execute', 'system_info', 'battery_status', 'deep_research',
    'clipboard_get', 'clipboard_set', 'window_switch',
    'navigate', 'click', 'type', 'screenshot_and_extract',
    'scroll', 'wait', 'select', 'extract_text', 'go_back',
  ];
  if (validActions.includes(action)) return action;
  return 'extract_text';
}
