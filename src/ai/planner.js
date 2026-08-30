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

  // Get the plan from Gemini
  const aiPlan = await geminiPlan(command);

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
 * Validate an action type, falling back to extract_text for unknown actions.
 */
function validateAction(action) {
  const validActions = [
    'media_control', 'app_launch', 'app_close',
    'navigate', 'click', 'type', 'screenshot_and_extract',
    'scroll', 'wait', 'select', 'extract_text', 'go_back',
  ];
  if (validActions.includes(action)) return action;
  return 'extract_text';
}
