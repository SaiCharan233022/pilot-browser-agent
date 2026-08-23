/**
 * Gemini API client wrapper.
 * Handles all LLM interactions: planning, vision analysis, re-planning, summarization.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  PLANNER_SYSTEM_PROMPT,
  VISION_ANALYSIS_PROMPT,
  REPLAN_PROMPT,
  SUMMARY_PROMPT,
  SMART_SELECTOR_PROMPT
} from './prompts.js';

let genAI = null;
let model = null;
let visionModel = null;

/**
 * Initialize the Gemini API client.
 * @param {string} apiKey - Gemini API key
 */
export function initGemini(apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
  // Use Gemini 2.5 Flash for planning (fast, free tier)
  model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  // Same model handles vision (it's multimodal)
  visionModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
}

/**
 * Check if Gemini is initialized.
 */
export function isGeminiReady() {
  return model !== null;
}

/**
 * Parse JSON from LLM response, handling markdown code fences.
 */
function parseJsonResponse(text) {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return JSON.parse(cleaned.trim());
}

/**
 * Plan a task given a natural language command.
 * @param {string} userCommand - The user's task description
 * @returns {Promise<Object>} - Structured plan with steps
 */
export async function planTask(userCommand) {
  if (!model) throw new Error('Gemini not initialized. Set your API key first.');

  const chat = model.startChat({
    systemInstruction: PLANNER_SYSTEM_PROMPT,
  });

  const result = await chat.sendMessage(userCommand);
  const text = result.response.text();

  try {
    const plan = parseJsonResponse(text);
    return plan;
  } catch (err) {
    console.error('Failed to parse plan JSON:', text);
    throw new Error(`AI returned invalid plan format: ${err.message}`);
  }
}

/**
 * Analyze a screenshot with optional context.
 * @param {Buffer} screenshotBuffer - Screenshot image buffer
 * @param {Object} context - Page context (url, title, task, stepDescription)
 * @returns {Promise<Object>} - Analysis result
 */
export async function analyzeScreenshot(screenshotBuffer, context = {}) {
  if (!visionModel) throw new Error('Gemini not initialized.');

  const prompt = VISION_ANALYSIS_PROMPT
    .replace('{url}', context.url || 'unknown')
    .replace('{title}', context.title || 'unknown')
    .replace('{task}', context.task || 'unknown')
    .replace('{stepDescription}', context.stepDescription || 'Analyze the page');

  const imagePart = {
    inlineData: {
      data: screenshotBuffer.toString('base64'),
      mimeType: 'image/png',
    },
  };

  const result = await visionModel.generateContent([prompt, imagePart]);
  const text = result.response.text();

  try {
    return parseJsonResponse(text);
  } catch (err) {
    // If JSON parsing fails, return raw text as extracted data
    return {
      pageDescription: text,
      extractedData: text,
      elementFound: false,
      suggestedSelector: null,
      error: null,
      nextAction: null,
    };
  }
}

/**
 * Re-plan after a step failure.
 * @param {Object} params - Re-planning context
 * @returns {Promise<Object>} - New plan
 */
export async function replan({
  originalTask,
  originalPlan,
  completedSteps,
  failedStepId,
  failedStepDescription,
  error,
  currentUrl,
  currentTitle,
  screenshotBuffer,
}) {
  if (!visionModel) throw new Error('Gemini not initialized.');

  const prompt = REPLAN_PROMPT
    .replace('{originalTask}', originalTask)
    .replace('{originalPlan}', JSON.stringify(originalPlan, null, 2))
    .replace('{completedSteps}', JSON.stringify(completedSteps, null, 2))
    .replace('{failedStepId}', failedStepId)
    .replace('{failedStepDescription}', failedStepDescription)
    .replace('{error}', error)
    .replace('{currentUrl}', currentUrl || 'unknown')
    .replace('{currentTitle}', currentTitle || 'unknown');

  const parts = [prompt];

  if (screenshotBuffer) {
    parts.push({
      inlineData: {
        data: screenshotBuffer.toString('base64'),
        mimeType: 'image/png',
      },
    });
  }

  const result = await visionModel.generateContent(parts);
  const text = result.response.text();

  try {
    return parseJsonResponse(text);
  } catch (err) {
    return {
      summary: 'Failed to re-plan',
      steps: [],
      abort: true,
      abortReason: `AI could not generate a new plan: ${text}`,
    };
  }
}

/**
 * Generate a summary of a completed task.
 * @param {string} originalTask - The original user command
 * @param {Array} executedSteps - Steps that were executed with results
 * @param {Array} extractedData - All data extracted during the task
 * @returns {Promise<string>} - Markdown summary
 */
export async function summarizeTask(originalTask, executedSteps, extractedData) {
  if (!model) throw new Error('Gemini not initialized.');

  const prompt = SUMMARY_PROMPT
    .replace('{originalTask}', originalTask)
    .replace('{executedSteps}', JSON.stringify(executedSteps, null, 2))
    .replace('{extractedData}', JSON.stringify(extractedData, null, 2));

  const result = await model.generateContent(prompt);
  return result.response.text();
}

/**
 * Find the best CSS selector for an element described in natural language.
 * @param {string} elementDescription - Description of the element
 * @param {Buffer} screenshotBuffer - Current page screenshot
 * @param {Object} pageInfo - Page URL and title
 * @returns {Promise<Object>} - Selector suggestions
 */
export async function findSelector(elementDescription, screenshotBuffer, pageInfo = {}) {
  if (!visionModel) throw new Error('Gemini not initialized.');

  const prompt = SMART_SELECTOR_PROMPT
    .replace('{elementDescription}', elementDescription)
    .replace('{url}', pageInfo.url || 'unknown')
    .replace('{title}', pageInfo.title || 'unknown');

  const parts = [prompt];

  if (screenshotBuffer) {
    parts.push({
      inlineData: {
        data: screenshotBuffer.toString('base64'),
        mimeType: 'image/png',
      },
    });
  }

  const result = await visionModel.generateContent(parts);
  const text = result.response.text();

  try {
    return parseJsonResponse(text);
  } catch (err) {
    return { selectors: [], elementVisible: false, notes: text };
  }
}
