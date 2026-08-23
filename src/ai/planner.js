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
      url: step.url || null,
      selector: step.selector || null,
      text: step.text || null,
      direction: step.direction || null,
      amount: step.amount || null,
      description: step.description || `Step ${index + 1}`,
      sensitive: step.sensitive || isSensitiveAction(step),
      status: 'pending', // pending | running | completed | failed | skipped
      result: null,
      screenshot: null,
      timestamp: null,
    })),
    status: 'planned', // planned | running | paused | completed | failed | cancelled
    createdAt: new Date().toISOString(),
    completedAt: null,
  };

  if (plan.steps.length === 0) {
    throw new Error('AI generated an empty plan. Please try rephrasing your command.');
  }

  return plan;
}

/**
 * Validate an action type, falling back to screenshot_and_extract for unknown actions.
 */
function validateAction(action) {
  const validActions = [
    'navigate', 'click', 'type', 'screenshot_and_extract',
    'scroll', 'wait', 'select', 'confirm', 'extract_text',
    'go_back',
  ];
  if (validActions.includes(action)) return action;
  console.warn(`Unknown action "${action}", treating as screenshot_and_extract`);
  return 'screenshot_and_extract';
}

/**
 * Detect if a step involves a sensitive/irreversible action that needs user approval.
 */
function isSensitiveAction(step) {
  if (step.action === 'confirm') return true;
  if (step.sensitive === true) return true;

  const sensitiveKeywords = [
    'submit', 'send', 'post', 'publish', 'delete', 'remove',
    'purchase', 'buy', 'pay', 'checkout', 'order', 'confirm',
    'sign up', 'register', 'subscribe', 'unsubscribe',
    'tweet', 'reply', 'comment', 'share',
  ];

  const desc = (step.description || '').toLowerCase();
  const text = (step.text || '').toLowerCase();

  return sensitiveKeywords.some(kw => desc.includes(kw) || text.includes(kw));
}
