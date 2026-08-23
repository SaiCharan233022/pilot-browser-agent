/**
 * Action Handlers — maps plan actions to browser controller methods.
 * Each handler executes a single browser action and returns a result.
 */

import * as browser from '../browser/controller.js';
import { analyzeScreenshot, findSelector } from '../ai/gemini.js';

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
      screenshot: null,
      result: null,
    };
  }

  try {
    const result = await handler(step, context);

    // Take a screenshot after every action (for the UI)
    let screenshotBuffer = null;
    try {
      const filename = `${context.taskId}_step${step.id}_${Date.now()}.png`;
      screenshotBuffer = await browser.screenshot(filename);
      result.screenshotFile = filename;
    } catch (err) {
      console.warn('⚠️  Could not capture screenshot:', err.message);
    }

    return {
      success: result.success !== false,
      result: result,
      screenshot: screenshotBuffer,
      screenshotFile: result.screenshotFile || null,
      error: result.error || null,
    };
  } catch (err) {
    // Capture screenshot of the error state
    let screenshotBuffer = null;
    try {
      screenshotBuffer = await browser.screenshot();
    } catch { /* ignore screenshot errors */ }

    return {
      success: false,
      error: err.message,
      screenshot: screenshotBuffer,
      result: null,
    };
  }
}

/**
 * Map of action names to handler functions.
 */
const actionMap = {

  /**
   * Navigate to a URL.
   */
  navigate: async (step) => {
    if (!step.url) return { success: false, error: 'No URL provided for navigate action' };
    return await browser.navigate(step.url);
  },

  /**
   * Click on an element.
   */
  click: async (step, context) => {
    if (!step.selector) {
      // Try to find the element using AI vision
      const screenshot = await browser.screenshot();
      const pageInfo = await browser.getPageInfo();
      const selectorResult = await findSelector(step.description, screenshot, pageInfo);
      if (selectorResult.selectors && selectorResult.selectors.length > 0) {
        step.selector = selectorResult.selectors[0].selector;
      } else {
        return { success: false, error: 'No selector provided and AI could not find the element' };
      }
    }
    return await browser.click(step.selector);
  },

  /**
   * Type text into an input.
   */
  type: async (step, context) => {
    if (!step.selector || !step.text) {
      if (!step.text) return { success: false, error: 'No text provided for type action' };
      // Try to find input using AI
      const screenshot = await browser.screenshot();
      const pageInfo = await browser.getPageInfo();
      const selectorResult = await findSelector(step.description, screenshot, pageInfo);
      if (selectorResult.selectors && selectorResult.selectors.length > 0) {
        step.selector = selectorResult.selectors[0].selector;
      } else {
        return { success: false, error: 'No selector provided and AI could not find the input' };
      }
    }
    return await browser.type(step.selector, step.text);
  },

  /**
   * Take a screenshot and analyze it with AI vision.
   */
  screenshot_and_extract: async (step, context) => {
    const screenshotBuffer = await browser.screenshot();
    const pageInfo = await browser.getPageInfo();

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
  scroll: async (step) => {
    return await browser.scroll(step.direction || 'down', step.amount || 'page');
  },

  /**
   * Wait for an element.
   */
  wait: async (step) => {
    if (!step.selector) return { success: true, note: 'No selector, waited briefly' };
    return await browser.waitForElement(step.selector, 10000);
  },

  /**
   * Select an option from a dropdown.
   */
  select: async (step) => {
    if (!step.selector || !step.text) {
      return { success: false, error: 'Selector and text required for select action' };
    }
    return await browser.selectOption(step.selector, step.text);
  },

  /**
   * Confirm action — this is handled by the task runner (pauses for user approval).
   * This handler just returns a marker that approval is needed.
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
  extract_text: async (step) => {
    const text = await browser.extractText(step.selector || null);
    return { success: true, extractedText: text };
  },

  /**
   * Go back to the previous page.
   */
  go_back: async (step) => {
    return await browser.goBack();
  },
};
