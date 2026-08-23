/**
 * Task Runner — orchestrates the complete lifecycle of a browser automation task.
 * Implements a state machine: Planning → Executing → WaitingForApproval → Summarizing → Completed
 */

import { createPlan } from '../ai/planner.js';
import { replan, summarizeTask } from '../ai/gemini.js';
import { executeAction } from './actionHandlers.js';
import * as browser from '../browser/controller.js';
import { saveTask, saveStep, updateTaskStatus } from '../storage/history.js';

// Active tasks (keyed by taskId)
const activeTasks = new Map();

// Approval callbacks (keyed by `taskId:stepId`)
const pendingApprovals = new Map();

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
  broadcast({ type: 'status', status: 'planning', message: 'Breaking down your task...' });

  let plan;
  try {
    plan = await createPlan(command);
  } catch (err) {
    broadcast({ type: 'error', message: `Failed to create plan: ${err.message}` });
    return { success: false, error: err.message };
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
      sensitive: s.sensitive,
      status: s.status,
    })),
  });

  // === LAUNCH BROWSER ===
  if (!browser.isRunning()) {
    broadcast({ type: 'browser_status', status: 'launching' });
    try {
      await browser.launch({
        headless: options.headless ?? false,
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

    // Check if this is a sensitive action requiring approval
    if (step.sensitive || step.action === 'confirm') {
      // Take a screenshot for the approval request
      let approvalScreenshot = null;
      try {
        approvalScreenshot = await browser.screenshot();
      } catch { /* ok */ }

      task.status = 'paused';
      broadcast({
        type: 'approval_required',
        taskId: plan.taskId,
        stepId: step.id,
        description: step.description,
        screenshot: approvalScreenshot ? approvalScreenshot.toString('base64') : null,
      });

      // Wait for user approval
      const approved = await waitForApproval(plan.taskId, step.id);

      if (!approved) {
        step.status = 'skipped';
        broadcast({
          type: 'step_skipped',
          taskId: plan.taskId,
          stepId: step.id,
          description: step.description,
        });
        saveStep(plan.taskId, step);
        continue;
      }

      task.status = 'running';

      // For confirm-only actions, just mark as complete and continue
      if (step.action === 'confirm') {
        step.status = 'completed';
        step.result = { approved: true };
        broadcast({
          type: 'step_complete',
          taskId: plan.taskId,
          stepId: step.id,
          description: step.description,
          result: 'User approved',
        });
        task.completedSteps.push(step);
        saveStep(plan.taskId, step);
        continue;
      }
    }

    // Execute the action
    const actionResult = await executeAction(step, {
      taskId: plan.taskId,
      task: command,
    });

    if (actionResult.success) {
      step.status = 'completed';
      step.result = actionResult.result;
      step.screenshot = actionResult.screenshotFile;
      task.completedSteps.push(step);

      // Collect extracted data
      if (actionResult.result?.extractedData) {
        task.extractedData.push({
          stepId: step.id,
          data: actionResult.result.extractedData,
        });
      }

      broadcast({
        type: 'step_complete',
        taskId: plan.taskId,
        stepId: step.id,
        description: step.description,
        screenshot: actionResult.screenshot ? actionResult.screenshot.toString('base64') : null,
        screenshotFile: actionResult.screenshotFile,
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
        screenshot: actionResult.screenshot ? actionResult.screenshot.toString('base64') : null,
      });

      // === RE-PLANNING PHASE ===
      broadcast({
        type: 'replanning',
        taskId: plan.taskId,
        reason: `Step ${step.id} failed: ${actionResult.error}`,
      });

      try {
        const pageInfo = await browser.getPageInfo();
        const replanScreenshot = await browser.screenshot();

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
            message: `Task aborted: ${newPlan.abortReason}`,
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

          // Remove remaining old steps, add new ones
          plan.steps = [...plan.steps.slice(0, i + 1), ...newSteps];

          broadcast({
            type: 'replan_complete',
            taskId: plan.taskId,
            newSteps: newSteps.map(s => ({
              id: s.id,
              action: s.action,
              description: s.description,
              sensitive: s.sensitive,
              status: s.status,
            })),
          });
        }
      } catch (replanErr) {
        console.error('Re-planning failed:', replanErr);
        // Continue with remaining steps anyway
      }
    }

    saveStep(plan.taskId, step);

    // Small delay between steps to avoid overwhelming pages
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // === SUMMARIZATION PHASE ===
  broadcast({ type: 'status', status: 'summarizing', message: 'Generating summary...', taskId: plan.taskId });

  let summary = '';
  try {
    summary = await summarizeTask(command, task.completedSteps, task.extractedData);
  } catch (err) {
    console.error('Summary generation failed:', err);
    summary = `Task completed. ${task.completedSteps.length}/${plan.steps.length} steps succeeded.`;
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
 * Wait for user approval of a sensitive action.
 * Returns a promise that resolves when the user approves or rejects.
 */
function waitForApproval(taskId, stepId) {
  return new Promise((resolve) => {
    const key = `${taskId}:${stepId}`;
    pendingApprovals.set(key, resolve);

    // Auto-timeout after 5 minutes
    setTimeout(() => {
      if (pendingApprovals.has(key)) {
        pendingApprovals.delete(key);
        resolve(false); // Auto-reject
        broadcast({
          type: 'approval_timeout',
          taskId,
          stepId,
          message: 'Approval timed out after 5 minutes. Step skipped.',
        });
      }
    }, 5 * 60 * 1000);
  });
}

/**
 * Approve a pending action.
 */
export function approveAction(taskId, stepId) {
  const key = `${taskId}:${stepId}`;
  const resolve = pendingApprovals.get(key);
  if (resolve) {
    pendingApprovals.delete(key);
    resolve(true);
  }
}

/**
 * Reject/cancel a pending action.
 */
export function rejectAction(taskId, stepId) {
  const key = `${taskId}:${stepId}`;
  const resolve = pendingApprovals.get(key);
  if (resolve) {
    pendingApprovals.delete(key);
    resolve(false);
  }
}

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
  if (result.extractedData) return result.extractedData;
  if (result.extractedText) return result.extractedText.substring(0, 500);
  if (result.pageDescription) return result.pageDescription;
  if (result.url) return `Navigated to: ${result.url}`;
  if (result.success) return 'Completed successfully';
  return JSON.stringify(result).substring(0, 200);
}
