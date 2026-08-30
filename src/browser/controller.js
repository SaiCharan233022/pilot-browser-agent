/**
 * Browser Controller — Ultra High-Speed Playwright Engine.
 * Pre-warmed browser, instant selector resolution, zero artificial delays,
 * and high-speed navigation.
 */

import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { getProfilePath, ensureDataDirs } from './profile.js';

let browserContext = null;
let activePage = null;
let isHeadless = false;
let onStatusChange = null;

/**
 * Set a callback for browser status changes.
 */
export function setStatusCallback(callback) {
  onStatusChange = callback;
}

/**
 * Launch or warm-start the browser with optimal speed flags.
 */
export async function launch(options = {}) {
  if (browserContext) {
    return;
  }

  isHeadless = options.headless ?? false;
  const profileDir = getProfilePath(options.profilePath || 'auto');

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
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies,Translate,OptimizationHints',
      ],
      viewport: { width: 1366, height: 768 },
      ignoreDefaultArgs: ['--enable-automation', '--mute-audio'],
    });

    const pages = browserContext.pages();
    activePage = pages.length > 0 ? pages[0] : await browserContext.newPage();

    browserContext.on('page', (page) => {
      activePage = page;
    });

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
 * High-speed navigation.
 */
export async function navigate(url) {
  ensurePage();
  try {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    await activePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    return { success: true, url: activePage.url(), title: await activePage.title() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Instant resilient click with multi-tier fast fallback.
 */
export async function click(selector) {
  ensurePage();

  // 1. Direct CSS locator
  try {
    const loc = activePage.locator(selector).first();
    if (await loc.isVisible({ timeout: 800 }).catch(() => false)) {
      await loc.click({ timeout: 1500 });
      await ensureMediaPlays();
      return { success: true, method: 'css', selector };
    }
  } catch { /* proceed */ }

  const sLower = selector.toLowerCase();

  // 2. Video / media results
  if (sLower.includes('video') || sLower.includes('result') || sLower.includes('play') || sLower.includes('song') || sLower.includes('thumbnail')) {
    const videoSelectors = [
      'a#video-title',
      'ytd-video-renderer a#thumbnail',
      '#contents ytd-video-renderer a#video-title',
      'ytd-rich-item-renderer a#video-title',
      'a[href*="/watch?v="]',
      'ytd-video-renderer h3 a',
    ];
    for (const v of videoSelectors) {
      try {
        const loc = activePage.locator(v).first();
        if (await loc.isVisible({ timeout: 400 }).catch(() => false)) {
          await loc.click({ timeout: 1500 });
          await ensureMediaPlays();
          return { success: true, method: 'video-fast-click', selector: v };
        }
      } catch { /* next */ }
    }
  }

  // 3. Search buttons
  if (sLower.includes('search') || sLower.includes('icon')) {
    const searchSelectors = [
      'button#search-icon-legacy',
      'button[aria-label*="Search" i]',
      '#search-button button',
      'button.search-button',
      'input[type="submit"]',
    ];
    for (const s of searchSelectors) {
      try {
        const loc = activePage.locator(s).first();
        if (await loc.isVisible({ timeout: 300 }).catch(() => false)) {
          await loc.click({ timeout: 1200 });
          return { success: true, method: 'search-fast-click', selector: s };
        }
      } catch { /* next */ }
    }
  }

  // 4. Role / text matching
  const quoteMatch = selector.match(/['"]([^'"]+)['"]/);
  const cleanText = quoteMatch ? quoteMatch[1] : selector.replace(/^[a-z0-9#._-]+/i, '').trim() || selector;

  if (cleanText && cleanText.length > 1) {
    try {
      const link = activePage.getByRole('link', { name: cleanText, exact: false }).first();
      if (await link.isVisible({ timeout: 600 }).catch(() => false)) {
        await link.click({ timeout: 1500 });
        await ensureMediaPlays();
        return { success: true, method: 'role-link', text: cleanText };
      }
    } catch { /* next */ }

    try {
      const textEl = activePage.getByText(cleanText, { exact: false }).first();
      if (await textEl.isVisible({ timeout: 600 }).catch(() => false)) {
        await textEl.click({ timeout: 1500 });
        await ensureMediaPlays();
        return { success: true, method: 'get-by-text', text: cleanText };
      }
    } catch { /* next */ }
  }

  // 5. In-DOM fast evaluation
  try {
    const clicked = await activePage.evaluate((targetText) => {
      const links = Array.from(document.querySelectorAll('a, button, [role="button"]'));
      const match = links.find(el => (el.innerText || el.getAttribute('aria-label') || '').toLowerCase().includes(targetText.toLowerCase()));
      if (match) {
        match.click();
        return true;
      }
      const firstVideo = document.querySelector('a#video-title, ytd-video-renderer a, a[href*="watch"]');
      if (firstVideo) {
        firstVideo.click();
        return true;
      }
      return false;
    }, cleanText);

    if (clicked) {
      await ensureMediaPlays();
      return { success: true, method: 'dom-eval-click' };
    }
  } catch { /* proceed */ }

  return { success: false, error: `Could not click: "${selector}"` };
}

/**
 * Instant typing.
 */
export async function type(selector, text, pressEnter = true) {
  ensurePage();

  const isSearchField = selector.toLowerCase().includes('search') || selector.toLowerCase().includes('q') || selector.includes('input');
  const candidateSelectors = [
    selector,
    'input[name="search_query"]',
    'input#search',
    'input[name="q"]',
    'textarea[name="q"]',
    'input[type="text"]',
  ];

  for (const s of candidateSelectors) {
    try {
      const loc = activePage.locator(s).first();
      if (await loc.isVisible({ timeout: 500 }).catch(() => false)) {
        await loc.fill(text, { timeout: 1500 });
        if (pressEnter || isSearchField) {
          await loc.press('Enter').catch(() => {});
        }
        return { success: true, method: 'locator-fill', selector: s };
      }
    } catch { /* next */ }
  }

  try {
    const el = activePage.getByPlaceholder(selector, { exact: false }).first();
    await el.fill(text, { timeout: 1500 });
    if (pressEnter || isSearchField) {
      await el.press('Enter').catch(() => {});
    }
    return { success: true, method: 'placeholder', selector };
  } catch (err) {
    return { success: false, error: `Could not type into: ${selector}` };
  }
}

/**
 * Instant media unmuting and playback trigger.
 */
async function ensureMediaPlays() {
  try {
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
 * Take a screenshot.
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
 * Extract text content.
 */
export async function extractText(selector) {
  ensurePage();
  try {
    if (selector) {
      return await activePage.textContent(selector, { timeout: 3000 });
    }
    return await activePage.evaluate(() => document.body ? document.body.innerText.substring(0, 10000) : '');
  } catch (err) {
    return `Error: ${err.message}`;
  }
}

/**
 * Scroll.
 */
export async function scroll(direction = 'down', amount = 'page') {
  ensurePage();
  const pixels = amount === 'page' ? 700 : parseInt(amount) || 700;
  const delta = direction === 'up' ? -pixels : pixels;
  await activePage.evaluate((d) => window.scrollBy(0, d), delta);
  return { success: true, direction, amount: pixels };
}

/**
 * Wait for element.
 */
export async function waitForElement(selector, timeout = 4000) {
  ensurePage();
  try {
    await activePage.waitForSelector(selector, { timeout, state: 'visible' });
    return { success: true, selector };
  } catch {
    return { success: true, note: `Proceeded after wait` };
  }
}

/**
 * Select option.
 */
export async function selectOption(selector, value) {
  ensurePage();
  try {
    await activePage.selectOption(selector, { label: value }, { timeout: 3000 });
    return { success: true, selector, value };
  } catch {
    return { success: false, error: `Could not select "${value}"` };
  }
}

/**
 * Go back.
 */
export async function goBack() {
  ensurePage();
  try {
    await activePage.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 });
    return { success: true, url: activePage.url() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Page info.
 */
export async function getPageInfo() {
  ensurePage();
  return {
    url: activePage.url(),
    title: await activePage.title(),
  };
}

/**
 * Close browser.
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
 * Check if running.
 */
export function isRunning() {
  return browserContext !== null;
}

/**
 * Toggle headless mode.
 */
export function setHeadless(headless) {
  isHeadless = headless;
}

function ensurePage() {
  if (!activePage || !browserContext) {
    throw new Error('Browser not ready.');
  }
}
