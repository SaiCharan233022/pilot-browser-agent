/**
 * Browser Controller — High-Performance Playwright Automation Engine.
 * Supports visible & headless modes, full audio playback, smart selector fallbacks,
 * and reliable video/media interactions.
 */

import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { getProfilePath, ensureDataDirs } from './profile.js';

let browserContext = null;
let activePage = null;
let isHeadless = false; // Visible by default for full media/watch/listen support
let onStatusChange = null;

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
    return;
  }

  isHeadless = options.headless ?? false;
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
        '--autoplay-policy=no-user-gesture-required',
        '--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies',
      ],
      viewport: { width: 1366, height: 768 },
      ignoreDefaultArgs: ['--enable-automation', '--mute-audio'],
    });

    const pages = browserContext.pages();
    activePage = pages.length > 0 ? pages[0] : await browserContext.newPage();

    browserContext.on('page', (page) => {
      activePage = page;
    });

    console.log('✅ Browser launched successfully');
    onStatusChange?.('open');
  } catch (err) {
    console.error('❌ Failed to launch browser:', err.message);
    if (err.message.includes('lock') || err.message.includes('already running')) {
      throw new Error(
        'Chrome profile is locked. Please close any open Chrome windows and retry.'
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
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    await activePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await activePage.waitForTimeout(300);
    return { success: true, url: activePage.url(), title: await activePage.title() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Smart resilient click with multi-tier fallback.
 * @param {string} selector - CSS selector or target description
 * @returns {Promise<Object>} - Click result
 */
export async function click(selector) {
  ensurePage();

  // Tier 1: Direct CSS selector
  try {
    const loc = activePage.locator(selector).first();
    if (await loc.isVisible({ timeout: 2000 }).catch(() => false)) {
      await loc.click({ timeout: 4000 });
      await ensureMediaPlays();
      return { success: true, method: 'css', selector };
    }
  } catch { /* proceed to fallbacks */ }

  // Tier 2: YouTube & Media specific common selectors
  const sLower = selector.toLowerCase();
  if (sLower.includes('search') || sLower.includes('icon')) {
    const searchSelectors = [
      'button#search-icon-legacy',
      'button[aria-label*="Search" i]',
      '#search-button button',
      'button.search-button',
      'input[type="submit"]',
      'button[type="submit"]',
      '[aria-label*="Search" i]',
    ];
    for (const s of searchSelectors) {
      try {
        const loc = activePage.locator(s).first();
        if (await loc.isVisible({ timeout: 500 }).catch(() => false)) {
          await loc.click({ timeout: 3000 });
          return { success: true, method: 'search-fallback', selector: s };
        }
      } catch { /* next */ }
    }
  }

  if (sLower.includes('video') || sLower.includes('result') || sLower.includes('play') || sLower.includes('song')) {
    const videoSelectors = [
      'a#video-title',
      'ytd-video-renderer a#thumbnail',
      '#contents ytd-video-renderer a#video-title',
      'ytd-rich-item-renderer a#video-title',
      'a[href*="/watch?v="]',
      'ytd-video-renderer h3 a',
      '.ytd-video-renderer',
    ];
    for (const v of videoSelectors) {
      try {
        const loc = activePage.locator(v).first();
        if (await loc.isVisible({ timeout: 800 }).catch(() => false)) {
          await loc.click({ timeout: 3000 });
          await ensureMediaPlays();
          return { success: true, method: 'video-fallback', selector: v };
        }
      } catch { /* next */ }
    }
  }

  // Tier 3: Extract text quotes and search by Role or Text
  const quoteMatch = selector.match(/['"]([^'"]+)['"]/);
  const cleanText = quoteMatch ? quoteMatch[1] : selector.replace(/^[a-z0-9#._-]+/i, '').trim() || selector;

  if (cleanText && cleanText.length > 1) {
    try {
      const link = activePage.getByRole('link', { name: cleanText, exact: false }).first();
      if (await link.isVisible({ timeout: 1500 }).catch(() => false)) {
        await link.click({ timeout: 3000 });
        await ensureMediaPlays();
        return { success: true, method: 'role-link', text: cleanText };
      }
    } catch { /* next */ }

    try {
      const btn = activePage.getByRole('button', { name: cleanText, exact: false }).first();
      if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await btn.click({ timeout: 3000 });
        return { success: true, method: 'role-button', text: cleanText };
      }
    } catch { /* next */ }

    try {
      const textEl = activePage.getByText(cleanText, { exact: false }).first();
      if (await textEl.isVisible({ timeout: 1500 }).catch(() => false)) {
        await textEl.click({ timeout: 3000 });
        await ensureMediaPlays();
        return { success: true, method: 'get-by-text', text: cleanText };
      }
    } catch { /* next */ }
  }

  // Tier 4: Evaluate DOM click directly
  try {
    const clicked = await activePage.evaluate((targetText) => {
      // Find first clickable link or video item
      const links = Array.from(document.querySelectorAll('a, button, [role="button"]'));
      const match = links.find(el => (el.innerText || el.getAttribute('aria-label') || '').toLowerCase().includes(targetText.toLowerCase()));
      if (match) {
        match.click();
        return true;
      }
      if (links.length > 0 && (targetText.toLowerCase().includes('first') || targetText.toLowerCase().includes('video'))) {
        const firstVideo = document.querySelector('a#video-title, ytd-video-renderer a, a[href*="watch"]');
        if (firstVideo) {
          firstVideo.click();
          return true;
        }
      }
      return false;
    }, cleanText);

    if (clicked) {
      await ensureMediaPlays();
      return { success: true, method: 'dom-eval-click' };
    }
  } catch { /* proceed */ }

  return { success: false, error: `Could not interact with element: "${selector}"` };
}

/**
 * Type text into an input field.
 * @param {string} selector - CSS selector or element description
 * @param {string} text - Text to type
 * @param {boolean} pressEnter - Whether to press Enter after typing
 * @returns {Promise<Object>} - Type result
 */
export async function type(selector, text, pressEnter = true) {
  ensurePage();

  const isSearchField = selector.toLowerCase().includes('search') || selector.toLowerCase().includes('q') || selector.includes('input');

  // Try standard selectors
  const candidateSelectors = [
    selector,
    'input[name="search_query"]',
    'input#search',
    'input[name="q"]',
    'textarea[name="q"]',
    'input[type="text"]',
    'input[type="search"]',
  ];

  for (const s of candidateSelectors) {
    try {
      const loc = activePage.locator(s).first();
      if (await loc.isVisible({ timeout: 1000 }).catch(() => false)) {
        await loc.fill(text, { timeout: 3000 });
        if (pressEnter || isSearchField) {
          await loc.press('Enter').catch(() => {});
          await activePage.waitForTimeout(500);
        }
        return { success: true, method: 'locator-fill', selector: s };
      }
    } catch { /* next */ }
  }

  // Placeholder / label fallbacks
  try {
    const el = activePage.getByPlaceholder(selector, { exact: false }).first();
    await el.fill(text, { timeout: 3000 });
    if (pressEnter || isSearchField) {
      await el.press('Enter').catch(() => {});
    }
    return { success: true, method: 'placeholder', selector };
  } catch {
    try {
      const el = activePage.getByLabel(selector, { exact: false }).first();
      await el.fill(text, { timeout: 3000 });
      if (pressEnter || isSearchField) {
        await el.press('Enter').catch(() => {});
      }
      return { success: true, method: 'label', selector };
    } catch (err) {
      return { success: false, error: `Could not type into input: ${selector}. ${err.message}` };
    }
  }
}

/**
 * Ensure media is unmuted and playing.
 */
async function ensureMediaPlays() {
  try {
    await activePage.waitForTimeout(1000);
    await activePage.evaluate(() => {
      const videos = document.querySelectorAll('video');
      videos.forEach(v => {
        v.muted = false;
        v.volume = 1.0;
        v.play().catch(() => {});
      });
    });
  } catch { /* ok */ }
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
  await activePage.waitForTimeout(300);
  return { success: true, direction, amount: pixels };
}

/**
 * Wait for an element to appear.
 * @param {string} selector - CSS selector
 * @param {number} timeout - Max wait time in ms
 * @returns {Promise<Object>} - Wait result
 */
export async function waitForElement(selector, timeout = 8000) {
  ensurePage();
  try {
    await activePage.waitForSelector(selector, { timeout, state: 'visible' });
    return { success: true, selector };
  } catch {
    return { success: true, note: `Proceeded after waiting for ${selector}` };
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
  }
}

/**
 * Check if browser is currently running.
 */
export function isRunning() {
  return browserContext !== null;
}

/**
 * Toggle headless mode.
 * @param {boolean} headless
 */
export function setHeadless(headless) {
  isHeadless = headless;
}

function ensurePage() {
  if (!activePage || !browserContext) {
    throw new Error('Browser not launched. Call launch() first.');
  }
}
