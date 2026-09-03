/**
 * Task Runner — orchestrates the complete lifecycle of a browser automation task.
 * High-speed autonomous execution.
 */

import { createPlan } from '../ai/planner.js';
import { replan, summarizeTask } from '../ai/gemini.js';
import { executeAction } from './actionHandlers.js';
import * as browser from '../browser/controller.js';
import { saveTask, saveStep, updateTaskStatus } from '../storage/history.js';
import { recordTurn, setMemory } from '../storage/memory.js';

// Active tasks (keyed by taskId)
const activeTasks = new Map();

/**
 * Set the WebSocket broadcast function.
 */
let broadcastFn = null;
export function setBroadcast(fn) {
  broadcastFn = fn;
}

function broadcast(message) {
  broadcastFn?.(message);
}

/**
 * Start a new task from a user command.
 * @param {string} command - Natural language task description
 * @param {Object} options - Browser launch options
 * @returns {Promise<Object>} - Task result
 */
export async function runTask(command, options = {}) {
  // === PLANNING PHASE ===
  broadcast({ type: 'status', status: 'planning', message: 'Processing your request...' });

  let plan;
  try {
    plan = await createPlan(command);
  } catch (err) {
    broadcast({ type: 'error', message: `Failed to create plan: ${err.message}` });
    return { success: false, error: err.message };
  }

  // If this is a direct conversational message (0 steps)
  if (!plan.steps || plan.steps.length === 0) {
    plan.status = 'completed';
    plan.completedAt = new Date().toISOString();
    saveTask(plan);
    updateTaskStatus(plan.taskId, 'completed', plan.summary);

    broadcast({
      type: 'task_complete',
      taskId: plan.taskId,
      summary: plan.summary,
      stepsCompleted: 0,
      totalSteps: 0,
      extractedData: [],
    });
    return { success: true, taskId: plan.taskId, summary: plan.summary };
  }

  // Save task to history
  saveTask(plan);

  // Store active task
  activeTasks.set(plan.taskId, {
    plan,
    status: 'running',
    completedSteps: [],
    extractedData: [],
    currentStepIndex: 0,
  });

  // Broadcast the plan to the UI
  broadcast({
    type: 'plan',
    taskId: plan.taskId,
    summary: plan.summary,
    steps: plan.steps.map(s => ({
      id: s.id,
      action: s.action,
      description: s.description,
      status: s.status,
    })),
  });

  // === LAUNCH BROWSER (ONLY WHEN NEEDED) ===
  const needsBrowser = plan.steps.some(s => [
    'navigate', 'click', 'type', 'screenshot_and_extract', 'scroll', 'wait', 'select', 'extract_text', 'go_back'
  ].includes(s.action));

  if (needsBrowser && !browser.isRunning()) {
    broadcast({ type: 'browser_status', status: 'launching' });
    try {
      await browser.launch({
        headless: options.headless ?? (process.env.HEADLESS === 'true'),
        profilePath: options.profilePath,
      });
      broadcast({ type: 'browser_status', status: 'open' });
    } catch (err) {
      broadcast({ type: 'error', message: `Browser launch failed: ${err.message}` });
      updateTaskStatus(plan.taskId, 'failed');
      activeTasks.delete(plan.taskId);
      return { success: false, error: err.message };
    }
  }

  // === EXECUTION PHASE ===
  const task = activeTasks.get(plan.taskId);

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    task.currentStepIndex = i;

    // Check if task was cancelled
    if (task.status === 'cancelled') {
      broadcast({ type: 'task_cancelled', taskId: plan.taskId });
      updateTaskStatus(plan.taskId, 'cancelled');
      activeTasks.delete(plan.taskId);
      return { success: false, cancelled: true };
    }

    // Broadcast step start
    step.status = 'running';
    step.timestamp = new Date().toISOString();
    broadcast({
      type: 'step_start',
      taskId: plan.taskId,
      stepId: step.id,
      action: step.action,
      description: step.description,
    });

    // Execute the action directly (no approval pauses)
    const actionResult = await executeAction(step, {
      taskId: plan.taskId,
      task: command,
      clientScreenshot: options.clientScreenshot || null,
    });

    if (actionResult.success) {
      step.status = 'completed';
      step.result = actionResult.result;
      task.completedSteps.push(step);

      // Collect extracted data
      if (actionResult.result?.extractedData) {
        task.extractedData.push({
          stepId: step.id,
          data: actionResult.result.extractedData,
        });
      } else if (actionResult.result?.extractedText) {
        task.extractedData.push({
          stepId: step.id,
          data: actionResult.result.extractedText,
        });
      }

      broadcast({
        type: 'step_complete',
        taskId: plan.taskId,
        stepId: step.id,
        description: step.description,
        result: summarizeStepResult(actionResult.result),
      });
    } else {
      step.status = 'failed';
      step.result = { error: actionResult.error };

      broadcast({
        type: 'step_error',
        taskId: plan.taskId,
        stepId: step.id,
        description: step.description,
        error: actionResult.error,
      });

      // === RE-PLANNING PHASE ===
      broadcast({
        type: 'replanning',
        taskId: plan.taskId,
        reason: `Step ${step.id} failed: ${actionResult.error}`,
      });

      try {
        const pageInfo = await browser.getPageInfo(plan.taskId);
        const replanScreenshot = await browser.screenshot(null, plan.taskId);

        const newPlan = await replan({
          originalTask: command,
          originalPlan: plan,
          completedSteps: task.completedSteps,
          failedStepId: step.id,
          failedStepDescription: step.description,
          error: actionResult.error,
          currentUrl: pageInfo.url,
          currentTitle: pageInfo.title,
          screenshotBuffer: replanScreenshot,
        });

        if (newPlan.abort) {
          broadcast({
            type: 'error',
            message: `Task ended: ${newPlan.abortReason}`,
            taskId: plan.taskId,
          });
          updateTaskStatus(plan.taskId, 'failed');
          activeTasks.delete(plan.taskId);
          return { success: false, error: newPlan.abortReason };
        }

        // Replace remaining steps with new plan
        if (newPlan.steps && newPlan.steps.length > 0) {
          const newSteps = newPlan.steps.map((s, idx) => ({
            ...s,
            id: step.id + idx + 1,
            status: 'pending',
            result: null,
            screenshot: null,
            timestamp: null,
          }));

          plan.steps = [...plan.steps.slice(0, i + 1), ...newSteps];

          broadcast({
            type: 'replan_complete',
            taskId: plan.taskId,
            newSteps: newSteps.map(s => ({
              id: s.id,
              action: s.action,
              description: s.description,
              status: s.status,
            })),
          });
        }
      } catch (replanErr) {
        console.error('Re-planning failed:', replanErr);
      }
    }

    saveStep(plan.taskId, step);
  }

  // === SUMMARIZATION PHASE ===
  let summary = '';
  let openUrl = null;
  const systemActionSet = [
    'media_control', 'media_status', 'app_launch', 'app_close', 'open_and_play',
    'desktop_focus', 'desktop_type', 'desktop_key',
    'remember_fact', 'recall_knowledge', 'forget_fact', 'history_query',
    'file_search', 'file_read', 'file_write', 'file_list', 'pdf_read', 'document_read',
    'desktop_screen_inspect', 'terminal_command',
    'workflow_execute', 'system_info', 'battery_status', 'deep_research', 'research_and_save', 'refine_content',
    'clipboard_get', 'clipboard_set', 'window_switch', 'weather_query',
  ];
  const isAllSystemActions = plan.steps.every(s => systemActionSet.includes(s.action));

  let fileMeta = null;
  let focusWidget = null;

  if (plan.steps.length === 1 && plan.steps[0].action === 'navigate' && task.completedSteps.length > 0) {
    openUrl = plan.steps[0].url;
    const name = plan.steps[0].targetName || 'website';
    summary = `Opened ${name} directly on your screen.`;
    setMemory('last_target', name, 'context');
    setMemory('last_url', openUrl, 'context');
  } else if (isAllSystemActions && task.completedSteps.length > 0) {
    const lastStep = task.completedSteps[task.completedSteps.length - 1];
    if (lastStep.action === 'media_status') {
      const res = lastStep.result || {};
      const songInfo = res.media && res.media.title ? `Playing "${res.media.title}" by ${res.media.artist || 'Unknown'}.` : (res.activeAudioApps && res.activeAudioApps.length ? `Audio apps active: ${res.activeAudioApps.join(', ')}.` : 'No media currently playing.');
      summary = `Master volume: ${res.volume ?? 50}%. ${songInfo}`;
    } else if (lastStep.action === 'media_control') {
      const act = lastStep.mediaAction || 'media action';
      summary = lastStep.amount != null ? `System volume set to ${lastStep.amount}%.` : `Media action (${act}) executed successfully.`;
    } else if (lastStep.action === 'open_and_play') {
      summary = `Opened ${lastStep.appName || 'Spotify'} and started playback of your song.`;
      openUrl = 'https://open.spotify.com';
      setMemory('last_target', lastStep.appName || 'spotify', 'context');
    } else if (lastStep.action === 'app_launch') {
      summary = `Launched ${lastStep.appName || 'application'}.`;
      if ((lastStep.appName || '').toLowerCase() === 'spotify') {
        openUrl = 'https://open.spotify.com';
      } else if (lastStep.result?.openUrl) {
        openUrl = lastStep.result.openUrl;
      }
      setMemory('last_target', lastStep.appName, 'context');
    } else if (lastStep.action === 'app_close') {
      summary = `Closed ${lastStep.appName || 'application'}.`;
    } else if (lastStep.action === 'desktop_type') {
      summary = `Typed into ${lastStep.appName || 'application'}.`;
    } else if (lastStep.action === 'remember_fact') {
      const res = lastStep.result || {};
      summary = `Saved to memory: "${res.key || lastStep.key}" is "${res.content || lastStep.content}".`;
    } else if (lastStep.action === 'recall_knowledge') {
      const res = lastStep.result || {};
      if (res.match) {
        summary = `Your ${res.match.key} is: ${res.match.content}`;
      } else if (res.knowledge && res.knowledge.length > 0) {
        const list = res.knowledge.map(k => `• ${k.key}: ${k.content}`).join('\n');
        summary = `Here is what I remember:\n${list}`;
      } else {
        summary = `I don't have any saved knowledge for that yet. You can tell me "Remember that my <item> is <value>".`;
      }
    } else if (lastStep.action === 'history_query') {
      const res = lastStep.result || {};
      if (res.history && res.history.length > 0) {
        const list = res.history.map(h => `• [${h.role.toUpperCase()}] ${h.text}`).join('\n');
        summary = `Found ${res.count} matching message(s) in history:\n\n${list}`;
      } else if (res.inputs && res.inputs.length > 0) {
        const list = res.inputs.map((inp, idx) => `${idx + 1}. "${inp.text}" (${new Date(inp.created_at).toLocaleTimeString()})`).join('\n');
        summary = `Here are your recent inputs:\n\n${list}`;
      } else {
        summary = `No previous input history found.`;
      }
    } else if (lastStep.action === 'forget_fact') {
      const res = lastStep.result || {};
      summary = res.success ? `Forgot knowledge for "${lastStep.key}".` : `No stored knowledge found for "${lastStep.key}".`;
    } else if (lastStep.action === 'file_search') {
      const res = lastStep.result || {};
      if (res.files && res.files.length > 0) {
        const fileList = res.files.map(f => `📄 ${f.relativePath} (${f.size}, modified ${f.modified})`).join('\n');
        summary = `Found ${res.count} file(s) in ${res.directory}:\n\n${fileList}`;
      } else {
        summary = `No files found matching "${lastStep.pattern || '*'}" in ${res.directory || 'the directory'}.`;
      }
    } else if (lastStep.action === 'file_read') {
      const res = lastStep.result || {};
      if (res.success) {
        summary = `📄 ${res.name} (${res.displayedLines}/${res.totalLines} lines):\n\n\`\`\`\n${res.content}\n\`\`\``;
        fileMeta = {
          filePath: res.filePath || lastStep.filePath,
          name: res.name,
          content: res.content,
        };
      } else {
        summary = `Could not read file: ${res.error || 'Unknown error'}`;
      }
    } else if (lastStep.action === 'file_list') {
      const res = lastStep.result || {};
      if (res.items && res.items.length > 0) {
        const itemsList = res.items.map(i => `${i.type === 'folder' ? '📁' : '📄'} ${i.name}`).join('\n');
        summary = `Contents of ${res.directory} (${res.totalItems} items):\n\n${itemsList}`;
      } else {
        summary = `Directory is empty or could not be accessed.`;
      }
    } else if (lastStep.action === 'desktop_screen_inspect') {
      const res = lastStep.result || {};
      if (res.success && res.analysis) {
        summary = `🖥️ **Screen Analysis (${res.source === 'desktop' ? 'Full Desktop' : 'Active Viewport'}):**\n\n${res.analysis}`;
      } else {
        summary = `Could not inspect screen: ${res.error || 'Unknown error'}`;
      }
    } else if (lastStep.action === 'terminal_command') {
      const res = lastStep.result || {};
      if (res.success) {
        summary = `⌨️ **Command:** \`${res.command}\`\n\n\`\`\`text\n${res.output}\n\`\`\``;
      } else {
        summary = `❌ **Command Error:** \`${res.command}\`\n\n\`\`\`text\n${res.error || res.stderr || 'Execution failed'}\n\`\`\``;
      }
    } else if (lastStep.action === 'file_write') {
      const res = lastStep.result || {};
      if (res.success) {
        summary = `📝 **File Saved:** \`${res.name}\` (${res.size}) — ${res.message || 'File written successfully.'}`;
        fileMeta = {
          filePath: res.filePath || lastStep.filePath,
          name: res.name,
          content: lastStep.content || '',
        };
      } else {
        summary = `❌ Could not write file: ${res.error || 'Unknown error'}`;
      }
    } else if (lastStep.action === 'research_and_save') {
      const res = lastStep.result || {};
      if (res.success) {
        summary = res.summary || `📝 **Created & Saved:** \`${res.name}\` (${res.size})`;
        fileMeta = {
          filePath: res.filePath || lastStep.filePath,
          name: res.name,
          content: res.rawContent || '',
        };
      } else {
        summary = `❌ Could not research and save file: ${res.error || 'Unknown error'}`;
      }
    } else if (lastStep.action === 'weather_query') {
      const res = lastStep.result || {};
      summary = res.summary || `🌤️ **Weather:** Details retrieved for ${lastStep.topic || 'location'}.`;
    } else if (lastStep.action === 'refine_content') {
      const res = lastStep.result || {};
      summary = res.summary || `✨ **Refined Output:**\n\n${res.refined || 'Updated content.'}`;
    } else if (lastStep.action === 'document_read' || lastStep.action === 'pdf_read') {
      const res = lastStep.result || {};
      if (res.success) {
        summary = res.content || `📑 **Document Parsed:** ${res.name} (${res.size})`;
      } else {
        summary = `❌ Could not parse document: ${res.error || 'Unknown error'}`;
      }
    } else if (lastStep.action === 'workflow_execute') {
      const res = lastStep.result || {};
      summary = res.summary || `Workflow executed successfully.`;
      if (res.openUrl) openUrl = res.openUrl;
      if (res.focusWidget) focusWidget = res.focusWidget;
    } else if (lastStep.action === 'system_info') {
      const res = lastStep.result || {};
      if (res.success) {
        summary = `💻 **System Hardware & Health:**\n\n• **Battery:** ${res.battery?.percent} (${res.battery?.status})\n• **RAM:** ${res.ram?.used} / ${res.ram?.total} (Free: ${res.ram?.free})\n• **CPU:** ${res.cpu?.model} (${res.cpu?.cores} cores)\n• **Disk (C:):** Free ${res.disk?.free} / ${res.disk?.total}\n• **OS Uptime:** ${res.os?.uptime} (${res.os?.platform})`;
      } else {
        summary = `Could not query system info: ${res.error || 'Unknown error'}`;
      }
    } else if (lastStep.action === 'battery_status') {
      const res = lastStep.result || {};
      summary = `🔋 **Battery:** ${res.percent || '100%'} — ${res.status || 'AC Powered'}`;
    } else if (lastStep.action === 'deep_research') {
      const res = lastStep.result || {};
      summary = res.summary || res.report || `Deep research completed.`;
    } else if (lastStep.action === 'clipboard_get') {
      const res = lastStep.result || {};
      summary = `📋 **Clipboard:** ${res.text ? `\`${res.text}\`` : 'Clipboard is empty.'}`;
    } else if (lastStep.action === 'clipboard_set') {
      const res = lastStep.result || {};
      summary = `📋 Copied to clipboard: "${res.text}"`;
    } else if (lastStep.action === 'window_switch') {
      const res = lastStep.result || {};
      summary = `🪟 Brought ${lastStep.appName || 'application'} window to foreground.`;
    } else {
      summary = `Task completed successfully.`;
    }
  } else {
    broadcast({ type: 'status', status: 'summarizing', message: 'Formatting final output...', taskId: plan.taskId });
    try {
      summary = await summarizeTask(command, task.completedSteps, task.extractedData);
    } catch (err) {
      summary = task.extractedData.map(d => d.data).join('\n\n') || `Task completed successfully.`;
    }
  }

  // === COMPLETION ===
  plan.status = 'completed';
  plan.completedAt = new Date().toISOString();
  updateTaskStatus(plan.taskId, 'completed', summary);

  // Record conversation turn into persistent memory
  recordTurn('user', command, { target: plan.target || null });
  recordTurn('assistant', summary, { metadata: { taskId: plan.taskId } });

  broadcast({
    type: 'task_complete',
    taskId: plan.taskId,
    summary,
    openUrl,
    fileMeta,
    focusWidget,
    stepsCompleted: task.completedSteps.length,
    totalSteps: plan.steps.length,
    extractedData: task.extractedData,
  });

  activeTasks.delete(plan.taskId);

  return {
    success: true,
    taskId: plan.taskId,
    summary,
    stepsCompleted: task.completedSteps.length,
    totalSteps: plan.steps.length,
  };
}

/**
 * Approve a pending action (retained for API compatibility).
 */
export function approveAction() {}

/**
 * Reject/cancel a pending action (retained for API compatibility).
 */
export function rejectAction() {}

/**
 * Cancel a running task.
 */
export function cancelTask(taskId) {
  const task = activeTasks.get(taskId);
  if (task) {
    task.status = 'cancelled';
  }
}

/**
 * Create a human-readable summary of a step result.
 */
function summarizeStepResult(result) {
  if (!result) return 'Completed';
  if (result.error) return `Error: ${result.error}`;
  if (result.extractedData) return typeof result.extractedData === 'string' ? result.extractedData : JSON.stringify(result.extractedData);
  if (result.extractedText) return result.extractedText.substring(0, 300);
  if (result.url) return `Loaded: ${result.url}`;
  if (result.success) return 'Done';
  return 'Done';
}
