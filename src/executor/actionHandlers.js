/**
 * Action Handlers — maps plan actions to browser controller methods.
 * Each handler executes a single browser action and returns a result.
 */

import * as browser from '../browser/controller.js';
import { analyzeScreenshot, findSelector } from '../ai/gemini.js';
import { executeMediaAction } from '../system/mediaController.js';
import { launchApp, closeApp, getRunningApps } from '../system/appLauncher.js';

/**
 * Execute a single action step.
 * @param {Object} step - The step from the plan
 * @param {Object} context - Task context (task description, etc.)
 * @returns {Promise<Object>} - { success, result, screenshot, error }
 */
export async function executeAction(step, context = {}) {
  const handler = actionMap[step.action];
  if (!handler) {
    return {
      success: false,
      error: `Unknown action: ${step.action}`,
      result: null,
    };
  }

  try {
    const result = await handler(step, context);

    return {
      success: result.success !== false,
      result: result,
      error: result.error || null,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      result: null,
    };
  }
}

/**
 * Map of action names to handler functions.
 */
const actionMap = {

  /**
   * System Media and Volume Control.
   */
  media_control: async (step) => {
    const mediaAction = step.mediaAction || step.direction || step.text || 'toggle';
    const val = step.amount || step.value;
    const osResult = await executeMediaAction(mediaAction, val);
    try {
      await browser.controlAllMedia(mediaAction);
    } catch {}
    return osResult;
  },

  /**
   * Native Desktop Application Launch.
   */
  app_launch: async (step) => {
    const target = step.appName || step.text || step.description;
    return await launchApp(target);
  },

  /**
   * Native Desktop Application Close.
   */
  app_close: async (step) => {
    const target = step.appName || step.text || step.description;
    return await closeApp(target);
  },

  /**
   * Navigate to a URL.
   */
  navigate: async (step, context) => {
    if (!step.url) return { success: false, error: 'No URL provided for navigate action' };
    return await browser.navigate(step.url, context.taskId);
  },

  /**
   * Click on an element.
   */
  click: async (step, context) => {
    if (!step.selector) {
      const screenshot = await browser.screenshot(null, context.taskId);
      const pageInfo = await browser.getPageInfo(context.taskId);
      const selectorResult = await findSelector(step.description, screenshot, pageInfo);
      if (selectorResult.selectors && selectorResult.selectors.length > 0) {
        step.selector = selectorResult.selectors[0].selector;
      } else {
        return { success: false, error: 'No selector provided and AI could not find the element' };
      }
    }
    return await browser.click(step.selector, context.taskId);
  },

  /**
   * Type text into an input.
   */
  type: async (step, context) => {
    if (!step.selector || !step.text) {
      if (!step.text) return { success: false, error: 'No text provided for type action' };
      const screenshot = await browser.screenshot(null, context.taskId);
      const pageInfo = await browser.getPageInfo(context.taskId);
      const selectorResult = await findSelector(step.description, screenshot, pageInfo);
      if (selectorResult.selectors && selectorResult.selectors.length > 0) {
        step.selector = selectorResult.selectors[0].selector;
      } else {
        return { success: false, error: 'No selector provided and AI could not find the input' };
      }
    }
    return await browser.type(step.selector, step.text, true, context.taskId);
  },

  /**
   * Take a screenshot and analyze it with AI vision.
   */
  screenshot_and_extract: async (step, context) => {
    const screenshotBuffer = await browser.screenshot(null, context.taskId);
    const pageInfo = await browser.getPageInfo(context.taskId);

    const analysis = await analyzeScreenshot(screenshotBuffer, {
      url: pageInfo.url,
      title: pageInfo.title,
      task: context.task || '',
      stepDescription: step.description || 'Analyze the page',
    });

    return {
      success: true,
      analysis,
      extractedData: analysis.extractedData,
      pageDescription: analysis.pageDescription,
      nextAction: analysis.nextAction,
      error: analysis.error,
    };
  },

  /**
   * Scroll the page.
   */
  scroll: async (step, context) => {
    return await browser.scroll(step.direction || 'down', step.amount || 'page', context.taskId);
  },

  /**
   * Wait for an element.
   */
  wait: async (step, context) => {
    if (!step.selector) return { success: true, note: 'No selector, waited briefly' };
    return await browser.waitForElement(step.selector, 4000, context.taskId);
  },

  /**
   * Select an option from a dropdown.
   */
  select: async (step, context) => {
    if (!step.selector || !step.text) {
      return { success: false, error: 'Selector and text required for select action' };
    }
    return await browser.selectOption(step.selector, step.text, context.taskId);
  },

  /**
   * Confirm action.
   */
  confirm: async (step) => {
    return {
      success: true,
      requiresApproval: true,
      description: step.description,
    };
  },

  /**
   * Extract text from the page.
   */
  extract_text: async (step, context) => {
    const text = await browser.extractText(step.selector || null, context.taskId);
    return { success: true, extractedText: text };
  },

  /**
   * Go back to the previous page.
   */
  go_back: async (step, context) => {
    return await browser.goBack(context.taskId);
  },
};
