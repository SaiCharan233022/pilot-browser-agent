/**
 * Task Runner — orchestrates the complete lifecycle of a browser automation task.
 * High-speed autonomous execution.
 */

import { createPlan } from '../ai/planner.js';
import { replan, summarizeTask } from '../ai/gemini.js';
import { executeAction } from './actionHandlers.js';
import * as browser from '../browser/controller.js';
import { saveTask, saveStep, updateTaskStatus } from '../storage/history.js';

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

  // === LAUNCH BROWSER ===
  if (!browser.isRunning()) {
    broadcast({ type: 'browser_status', status: 'launching' });
    try {
      await browser.launch({
        headless: options.headless ?? true,
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
  broadcast({ type: 'status', status: 'summarizing', message: 'Formatting final output...', taskId: plan.taskId });

  let summary = '';
  try {
    summary = await summarizeTask(command, task.completedSteps, task.extractedData);
  } catch (err) {
    console.error('Summary generation failed:', err);
    summary = task.extractedData.map(d => d.data).join('\n\n') || `Task completed successfully.`;
  }

  // === COMPLETION ===
  plan.status = 'completed';
  plan.completedAt = new Date().toISOString();
  updateTaskStatus(plan.taskId, 'completed', summary);

  broadcast({
    type: 'task_complete',
    taskId: plan.taskId,
    summary,
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
