/**
 * Browser Controller — High-Speed Multi-Tab Playwright Engine.
 * Supports concurrent tasks, tab isolation, zero artificial delays,
 * and audio/video playback.
 */

import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { getProfilePath, ensureDataDirs, cleanProfileLocks } from './profile.js';
import { focusWindow } from '../system/desktopController.js';

let browserContext = null;
let activePage = null;
const taskPages = new Map(); // taskId -> Page
let isHeadless = false;
let onStatusChange = null;

export function setStatusCallback(callback) {
  onStatusChange = callback;
}

/**
 * Launch or warm-start the browser.
 */
export async function launch(options = {}) {
  if (browserContext) {
    return;
  }

  isHeadless = options.headless ?? false;
  const profileDir = getProfilePath(options.profilePath || 'auto');
  cleanProfileLocks(profileDir);

  const launchArgs = [
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies,Translate,OptimizationHints',
  ];

  try {
    browserContext = await chromium.launchPersistentContext(profileDir, {
      headless: isHeadless,
      args: launchArgs,
      viewport: { width: 1366, height: 768 },
      ignoreDefaultArgs: ['--enable-automation', '--mute-audio'],
    });
  } catch (launchErr) {
    cleanProfileLocks(profileDir);
    try {
      const fallbackDir = join(process.cwd(), 'data', `session-${Date.now()}`);
      mkdirSync(fallbackDir, { recursive: true });
      browserContext = await chromium.launchPersistentContext(fallbackDir, {
        headless: isHeadless,
        args: launchArgs,
        viewport: { width: 1366, height: 768 },
        ignoreDefaultArgs: ['--enable-automation', '--mute-audio'],
      });
    } catch (fallbackErr) {
      const browserInstance = await chromium.launch({
        headless: isHeadless,
        args: launchArgs,
      });
      browserContext = await browserInstance.newContext({
        viewport: { width: 1366, height: 768 },
      });
    }
  }

  const pages = browserContext.pages();
  activePage = pages.length > 0 ? pages[0] : await browserContext.newPage();

  browserContext.on('page', (page) => {
    activePage = page;
  });

  onStatusChange?.('open');
}

/**
 * Get or create a dedicated tab for a task.
 */
export async function getTaskPage(taskId) {
  if (!browserContext) {
    await launch({ headless: false });
  }

  if (taskId && taskPages.has(taskId)) {
    const existing = taskPages.get(taskId);
    if (!existing.isClosed()) {
      return existing;
    }
  }

  const pages = browserContext.pages().filter(p => !p.isClosed());
  let page = null;

  if (pages.length === 1 && pages[0].url() === 'about:blank' && taskPages.size === 0) {
    page = pages[0];
  } else if (!taskId && pages.length > 0) {
    page = pages[0];
  } else {
    page = await browserContext.newPage();
  }

  if (taskId) {
    taskPages.set(taskId, page);
    page.on('close', () => taskPages.delete(taskId));
  }

  activePage = page;
  try {
    await page.bringToFront();
  } catch {}

  return page;
}

/**
 * High-speed navigation.
 */
export async function navigate(url, taskId) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  // 1. Open immediately in a dedicated NEW BROWSER WINDOW to guarantee physical foreground appearance
  try {
    const { exec } = await import('child_process');
    const launchScript = `try { Start-Process chrome.exe -ArgumentList '--new-window', '${url}' -ErrorAction Stop } catch { try { Start-Process msedge.exe -ArgumentList '--new-window', '${url}' -ErrorAction Stop } catch { Start-Process '${url}' } }`;
    exec(`powershell.exe -NoProfile -Command "${launchScript}"`);
    setTimeout(() => {
      focusWindow('chrome').catch(() => {});
      focusWindow('msedge').catch(() => {});
      focusWindow('brave').catch(() => {});
      focusWindow('firefox').catch(() => {});
    }, 400);
  } catch {}

  // 2. Concurrently load in Playwright engine for automated interactions
  try {
    const page = await getTaskPage(taskId);
    await page.goto(url, { waitUntil: 'commit', timeout: 20000 }).catch(() => {});
    await page.bringToFront().catch(() => {});
    await ensureMediaPlays(page).catch(() => {});
    const title = await page.title().catch(() => url);
    return { success: true, url: page.url() || url, title: title || url };
  } catch (err) {
    return { success: true, url, title: url };
  }
}

/**
 * Instant resilient click with multi-tier fast fallback.
 */
export async function click(selector, taskId) {
  const page = await getTaskPage(taskId);

  // 1. Direct CSS locator
  try {
    const loc = page.locator(selector).first();
    if (await loc.isVisible({ timeout: 800 }).catch(() => false)) {
      await loc.click({ timeout: 1500 });
      await ensureMediaPlays(page);
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
      '[data-testid="play-button"]',
      'button[aria-label*="Play" i]',
    ];
    for (const v of videoSelectors) {
      try {
        const loc = page.locator(v).first();
        if (await loc.isVisible({ timeout: 400 }).catch(() => false)) {
          await loc.click({ timeout: 1500 });
          await ensureMediaPlays(page);
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
        const loc = page.locator(s).first();
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
      const link = page.getByRole('link', { name: cleanText, exact: false }).first();
      if (await link.isVisible({ timeout: 600 }).catch(() => false)) {
        await link.click({ timeout: 1500 });
        await ensureMediaPlays(page);
        return { success: true, method: 'role-link', text: cleanText };
      }
    } catch { /* next */ }

    try {
      const textEl = page.getByText(cleanText, { exact: false }).first();
      if (await textEl.isVisible({ timeout: 600 }).catch(() => false)) {
        await textEl.click({ timeout: 1500 });
        await ensureMediaPlays(page);
        return { success: true, method: 'get-by-text', text: cleanText };
      }
    } catch { /* next */ }
  }

  // 5. In-DOM fast evaluation
  try {
    const clicked = await page.evaluate((targetText) => {
      const links = Array.from(document.querySelectorAll('a, button, [role="button"]'));
      const match = links.find(el => (el.innerText || el.getAttribute('aria-label') || '').toLowerCase().includes(targetText.toLowerCase()));
      if (match) {
        match.click();
        return true;
      }
      const firstVideo = document.querySelector('a#video-title, ytd-video-renderer a, a[href*="watch"], [data-testid="play-button"]');
      if (firstVideo) {
        firstVideo.click();
        return true;
      }
      return false;
    }, cleanText);

    if (clicked) {
      await ensureMediaPlays(page);
      return { success: true, method: 'dom-eval-click' };
    }
  } catch { /* proceed */ }

  return { success: false, error: `Could not click: "${selector}"` };
}

/**
 * Instant typing.
 */
export async function type(selector, text, pressEnter = true, taskId) {
  const page = await getTaskPage(taskId);

  const isSearchField = selector.toLowerCase().includes('search') || selector.toLowerCase().includes('q') || selector.includes('input');
  const candidateSelectors = [
    selector,
    'input[name="search_query"]',
    'input#search',
    'input[name="q"]',
    'textarea[name="q"]',
    'input[type="text"]',
    '[data-testid="search-input"]',
  ];

  for (const s of candidateSelectors) {
    try {
      const loc = page.locator(s).first();
      if (await loc.isVisible({ timeout: 400 }).catch(() => false)) {
        await loc.fill(text, { timeout: 1200 });
        if (pressEnter || isSearchField) {
          await loc.press('Enter').catch(() => {});
        }
        return { success: true, selector: s, text };
      }
    } catch { /* next */ }
  }

  try {
    const el = page.getByPlaceholder(selector, { exact: false }).first();
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
 * Media unmuting and playback trigger.
 */
async function ensureMediaPlays(page) {
  try {
    await page.evaluate(() => {
      const videos = document.querySelectorAll('video, audio');
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
export async function screenshot(savePath, taskId) {
  const page = await getTaskPage(taskId);
  try {
    const buffer = await page.screenshot({ fullPage: false, type: 'png', timeout: 4000 });

    if (savePath) {
      const dir = join(process.cwd(), 'data', 'screenshots');
      mkdirSync(dir, { recursive: true });
      const fullPath = join(dir, savePath);
      writeFileSync(fullPath, buffer);
    }

    return buffer;
  } catch (err) {
    return Buffer.from('');
  }
}

/**
 * Extract text content.
 */
export async function extractText(selector, taskId) {
  const page = await getTaskPage(taskId);
  try {
    if (selector) {
      return await page.textContent(selector, { timeout: 3000 });
    }
    return await page.evaluate(() => document.body ? document.body.innerText.substring(0, 10000) : '');
  } catch (err) {
    return `Error: ${err.message}`;
  }
}

/**
 * Scroll.
 */
export async function scroll(direction = 'down', amount = 'page', taskId) {
  const page = await getTaskPage(taskId);
  const pixels = amount === 'page' ? 700 : parseInt(amount) || 700;
  const delta = direction === 'up' ? -pixels : pixels;
  await page.evaluate((d) => window.scrollBy(0, d), delta);
  return { success: true, direction, amount: pixels };
}

/**
 * Wait for element.
 */
export async function waitForElement(selector, timeout = 4000, taskId) {
  const page = await getTaskPage(taskId);
  try {
    await page.waitForSelector(selector, { timeout, state: 'visible' });
    return { success: true, selector };
  } catch {
    return { success: true, note: `Proceeded after wait` };
  }
}

/**
 * Select option.
 */
export async function selectOption(selector, value, taskId) {
  const page = await getTaskPage(taskId);
  try {
    await page.selectOption(selector, { label: value }, { timeout: 3000 });
    return { success: true, selector, value };
  } catch {
    return { success: false, error: `Could not select "${value}"` };
  }
}

/**
 * Go back.
 */
export async function goBack(taskId) {
  const page = await getTaskPage(taskId);
  try {
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 });
    return { success: true, url: page.url() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Page info.
 */
export async function getPageInfo(taskId) {
  const page = await getTaskPage(taskId);
  return {
    url: page.url(),
    title: await page.title(),
  };
}

/**
 * Control media playback across all open browser pages.
 */
export async function controlAllMedia(action) {
  if (!browserContext) return;
  const pages = browserContext.pages();
  for (const p of pages) {
    try {
      await p.evaluate((act) => {
        const els = document.querySelectorAll('video, audio');
        els.forEach(el => {
          if (act === 'pause' || act === 'stop') {
            el.pause();
          } else if (act === 'play' || act === 'resume') {
            el.muted = false;
            el.play().catch(() => {});
          }
        });
      }, action);
    } catch {}
  }
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
    taskPages.clear();
    onStatusChange?.('closed');
  }
}

export function isRunning() {
  return browserContext !== null;
}

export function setHeadless(headless) {
  isHeadless = headless;
}
