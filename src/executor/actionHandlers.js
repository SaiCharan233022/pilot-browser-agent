/**
 * Action Handlers — maps plan actions to browser and system controller methods.
 * Each handler executes a single action and returns a result.
 */

import * as browser from '../browser/controller.js';
import { analyzeScreenshot, findSelector } from '../ai/gemini.js';
import { executeMediaAction } from '../system/mediaController.js';
import { launchApp, closeApp, getRunningApps } from '../system/appLauncher.js';
import { focusWindow, typeDesktopText, sendDesktopKey, openAndPlay } from '../system/desktopController.js';
import { saveKnowledge, recallKnowledge, getAllKnowledge, forgetKnowledge, searchKnowledge, getUserInputs, searchConversationHistory } from '../storage/memory.js';
import { searchFiles, readFileContent, listDirectory } from '../system/fileExplorer.js';

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
   * System Media and Audio Status Query.
   */
  media_status: async () => {
    return await executeMediaAction('status');
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
   * Compound: Open application and immediately trigger playback.
   */
  open_and_play: async (step) => {
    const target = step.appName || step.text || 'spotify';
    return await openAndPlay(target);
  },

  /**
   * Focus desktop window.
   */
  desktop_focus: async (step) => {
    const target = step.appName || step.text || step.description;
    return await focusWindow(target);
  },

  /**
   * Type text into active desktop application.
   */
  desktop_type: async (step) => {
    const target = step.appName || 'active';
    const text = step.text || '';
    return await typeDesktopText(target, text);
  },

  /**
   * Send keystroke or hotkey to desktop.
   */
  desktop_key: async (step) => {
    const target = step.appName || 'active';
    const key = step.key || step.text || 'enter';
    return await sendDesktopKey(target, key);
  },

  /**
   * Remember user fact or preference.
   */
  remember_fact: async (step) => {
    return saveKnowledge(step.key || step.text, step.content || step.text, step.category || 'fact');
  },

  /**
   * Recall user knowledge or preferences.
   */
  recall_knowledge: async (step) => {
    if (step.key) {
      const match = recallKnowledge(step.key);
      if (match) {
        return { success: true, match, message: `${match.key}: ${match.content}` };
      }
    }
    if (step.query) {
      const matches = searchKnowledge(step.query);
      return { success: true, count: matches.length, matches };
    }
    const all = getAllKnowledge();
    return { success: true, count: all.length, knowledge: all };
  },

  /**
   * Query conversation and input history.
   */
  history_query: async (step) => {
    if (step.query) {
      const matches = searchConversationHistory(step.query);
      return { success: true, count: matches.length, history: matches };
    }
    const inputs = getUserInputs(step.limit || 15);
    return { success: true, count: inputs.length, inputs };
  },

  /**
   * Forget a fact or preference.
   */
  forget_fact: async (step) => {
    return forgetKnowledge(step.key || step.text);
  },

  /**
   * Search for local files matching wildcard or extension.
   */
  file_search: async (step) => {
    return await searchFiles(step.pattern || step.text || '*', step.baseDirQuery || 'project', step.maxResults || 25);
  },

  /**
   * Read contents of a local file safely.
   */
  file_read: async (step) => {
    return await readFileContent(step.filePath || step.text, step.maxLines || 150);
  },

  /**
   * List folder contents.
   */
  file_list: async (step) => {
    return await listDirectory(step.dirQuery || step.text || 'project');
  },

  /**
   * Navigate to a URL.
   */
  navigate: async (step, context) => {
    if (!step.url) {
      return { success: false, error: 'URL required for navigate action' };
    }
    return await browser.navigate(step.url, context.taskId);
  },

  /**
   * Click an element.
   */
  click: async (step, context) => {
    if (!step.selector) {
      return { success: false, error: 'Selector required for click action' };
    }
    return await browser.click(step.selector, 8000, context.taskId);
  },

  /**
   * Type text into an input element.
   */
  type: async (step, context) => {
    if (!step.selector) {
      return { success: false, error: 'Selector required for type action' };
    }
    return await browser.type(step.selector, step.text || '', context.taskId);
  },

  /**
   * Visual AI: Capture page screenshot, send to Gemini Vision, and extract data.
   */
  screenshot_and_extract: async (step, context) => {
    const screenshot = await browser.screenshot(context.taskId);
    if (!screenshot) {
      return { success: false, error: 'Failed to capture screenshot' };
    }

    const prompt = step.text || `Analyze this web page for the task: "${context.task || 'extract main data'}" and provide the exact answer clearly.`;
    const analysis = await analyzeScreenshot(screenshot, prompt);

    return {
      success: true,
      extractedData: analysis,
      screenshot: screenshot.toString('base64'),
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
