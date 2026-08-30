/**
 * Browser Controller — Playwright-based browser automation engine.
 * Provides high-level methods for all browser interactions.
 */

import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { getProfilePath, ensureDataDirs } from './profile.js';

let browserContext = null;
let activePage = null;
let isHeadless = true;
let onStatusChange = null; // Callback for status updates

/**
 * Set a callback for browser status changes.
 */
export function setStatusCallback(callback) {
  onStatusChange = callback;
}

/**
 * Launch the browser with the user's Chrome profile.
 * @param {Object} options
 * @param {boolean} options.headless - Run in headless mode
 * @param {string} options.profilePath - Chrome profile path config
 * @returns {Promise<void>}
 */
export async function launch(options = {}) {
  if (browserContext) {
    console.log('🌐 Browser already running');
    return;
  }

  isHeadless = options.headless ?? true;
  const profileDir = getProfilePath(options.profilePath || 'auto');

  console.log(`🚀 Launching browser (${isHeadless ? 'headless' : 'visible'})...`);

  try {
    browserContext = await chromium.launchPersistentContext(profileDir, {
      channel: 'chrome',
      headless: isHeadless,
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
      ],
      viewport: { width: 1366, height: 768 },
      ignoreDefaultArgs: ['--enable-automation'],
    });

    // Get or create the first page
    const pages = browserContext.pages();
    activePage = pages.length > 0 ? pages[0] : await browserContext.newPage();

    // Listen for new pages (popups, new tabs)
    browserContext.on('page', (page) => {
      console.log('📄 New page opened:', page.url());
      activePage = page;
    });

    console.log('✅ Browser launched successfully');
    onStatusChange?.('open');
  } catch (err) {
    console.error('❌ Failed to launch browser:', err.message);
    if (err.message.includes('lock') || err.message.includes('already running')) {
      throw new Error(
        'Chrome profile is locked. Please close all Chrome windows and try again, ' +
        'or run the setup script to clone your profile: npm run setup'
      );
    }
    throw err;
  }
}

/**
 * Navigate to a URL.
 * @param {string} url - Target URL
 * @returns {Promise<Object>} - Navigation result
 */
export async function navigate(url) {
  ensurePage();
  try {
    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    await activePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await activePage.waitForTimeout(200);
    return { success: true, url: activePage.url(), title: await activePage.title() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Click on an element.
 * @param {string} selector - CSS selector or text to find
 * @returns {Promise<Object>} - Click result
 */
export async function click(selector) {
  ensurePage();
  try {
    // Try CSS selector first
    try {
      await activePage.click(selector, { timeout: 5000 });
      return { success: true, method: 'css', selector };
    } catch {
      // Fall back to text-based click
      await activePage.getByText(selector, { exact: false }).first().click({ timeout: 5000 });
      return { success: true, method: 'text', selector };
    }
  } catch (err) {
    // Try role-based as final fallback
    try {
      await activePage.getByRole('button', { name: selector }).first().click({ timeout: 3000 });
      return { success: true, method: 'role', selector };
    } catch {
      return { success: false, error: `Could not find element: ${selector}. ${err.message}` };
    }
  }
}

/**
 * Type text into an input field.
 * @param {string} selector - CSS selector or element description
 * @param {string} text - Text to type
 * @returns {Promise<Object>} - Type result
 */
export async function type(selector, text, pressEnter = false) {
  ensurePage();
  try {
    try {
      await activePage.fill(selector, text, { timeout: 5000 });
      if (pressEnter || selector.toLowerCase().includes('search') || selector.toLowerCase().includes('q')) {
        await activePage.press(selector, 'Enter').catch(() => {});
      }
      return { success: true, method: 'css', selector };
    } catch {
      // Try placeholder/label text
      const el = activePage.getByPlaceholder(selector, { exact: false }).first();
      await el.fill(text, { timeout: 5000 });
      if (pressEnter || selector.toLowerCase().includes('search')) {
        await el.press('Enter').catch(() => {});
      }
      return { success: true, method: 'placeholder', selector };
    }
  } catch (err) {
    try {
      const el = activePage.getByLabel(selector, { exact: false }).first();
      await el.fill(text, { timeout: 3000 });
      if (pressEnter || selector.toLowerCase().includes('search')) {
        await el.press('Enter').catch(() => {});
      }
      return { success: true, method: 'label', selector };
    } catch {
      return { success: false, error: `Could not find input: ${selector}. ${err.message}` };
    }
  }
}

/**
 * Take a screenshot of the current page.
 * @param {string} [savePath] - Optional path to save the screenshot
 * @returns {Promise<Buffer>} - Screenshot buffer
 */
export async function screenshot(savePath) {
  ensurePage();
  const buffer = await activePage.screenshot({ fullPage: false, type: 'png' });

  if (savePath) {
    const dir = join(process.cwd(), 'data', 'screenshots');
    mkdirSync(dir, { recursive: true });
    const fullPath = join(dir, savePath);
    writeFileSync(fullPath, buffer);
  }

  return buffer;
}

/**
 * Extract text content from the page or a specific element.
 * @param {string} [selector] - Optional CSS selector to extract from
 * @returns {Promise<string>} - Extracted text
 */
export async function extractText(selector) {
  ensurePage();
  try {
    if (selector) {
      return await activePage.textContent(selector, { timeout: 5000 });
    }
    // Get body text, limited to prevent excessive data
    return await activePage.evaluate(() => {
      const body = document.body;
      if (!body) return '';
      return body.innerText.substring(0, 10000);
    });
  } catch (err) {
    return `Error extracting text: ${err.message}`;
  }
}

/**
 * Scroll the page.
 * @param {string} direction - 'up' or 'down'
 * @param {number|string} amount - Pixels or 'page'
 * @returns {Promise<Object>} - Scroll result
 */
export async function scroll(direction = 'down', amount = 'page') {
  ensurePage();
  const pixels = amount === 'page' ? 700 : parseInt(amount) || 700;
  const delta = direction === 'up' ? -pixels : pixels;

  await activePage.evaluate((d) => window.scrollBy(0, d), delta);
  await activePage.waitForTimeout(500);
  return { success: true, direction, amount: pixels };
}

/**
 * Wait for an element to appear.
 * @param {string} selector - CSS selector
 * @param {number} timeout - Max wait time in ms
 * @returns {Promise<Object>} - Wait result
 */
export async function waitForElement(selector, timeout = 10000) {
  ensurePage();
  try {
    await activePage.waitForSelector(selector, { timeout, state: 'visible' });
    return { success: true, selector };
  } catch (err) {
    return { success: false, error: `Element not found within ${timeout}ms: ${selector}` };
  }
}

/**
 * Select an option from a dropdown.
 * @param {string} selector - CSS selector of the select element
 * @param {string} value - Option value or text to select
 * @returns {Promise<Object>} - Select result
 */
export async function selectOption(selector, value) {
  ensurePage();
  try {
    await activePage.selectOption(selector, { label: value }, { timeout: 5000 });
    return { success: true, selector, value };
  } catch (err) {
    try {
      await activePage.selectOption(selector, value, { timeout: 5000 });
      return { success: true, selector, value };
    } catch {
      return { success: false, error: `Could not select "${value}" in ${selector}: ${err.message}` };
    }
  }
}

/**
 * Go back to the previous page.
 * @returns {Promise<Object>} - Navigation result
 */
export async function goBack() {
  ensurePage();
  try {
    await activePage.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
    return { success: true, url: activePage.url() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get information about the current page.
 * @returns {Promise<Object>} - Page info
 */
export async function getPageInfo() {
  ensurePage();
  return {
    url: activePage.url(),
    title: await activePage.title(),
  };
}

/**
 * Close the browser.
 */
export async function close() {
  if (browserContext) {
    try {
      await browserContext.close();
    } catch (err) {
      console.warn('⚠️  Error closing browser:', err.message);
    }
    browserContext = null;
    activePage = null;
    onStatusChange?.('closed');
    console.log('🔒 Browser closed');
  }
}

/**
 * Check if browser is currently running.
 */
export function isRunning() {
  return browserContext !== null;
}

/**
 * Toggle headless mode. Requires browser restart.
 * @param {boolean} headless
 */
export function setHeadless(headless) {
  isHeadless = headless;
}

/**
 * Ensure there's an active page to interact with.
 */
function ensurePage() {
  if (!activePage || !browserContext) {
    throw new Error('Browser not launched. Call launch() first.');
  }
}
