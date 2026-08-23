/**
 * Chrome Profile Manager
 * Detects, validates, and clones the user's Chrome profile for browser automation.
 */

import { existsSync, mkdirSync, cpSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DATA_DIR = join(process.cwd(), 'data');
const CLONED_PROFILE_DIR = join(DATA_DIR, 'chrome-profile');

/**
 * Get the default Chrome user data directory for the current OS.
 */
function getDefaultChromeUserDataDir() {
  const home = homedir();
  // Windows
  return join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
}

/**
 * Detect and return the path to the Chrome user data directory.
 * Returns the cloned profile if it exists, otherwise detects the original.
 * @param {string} configuredPath - Path from .env config ('auto' for auto-detect)
 * @returns {string} Path to use for Playwright
 */
export function getProfilePath(configuredPath = 'auto') {
  // If cloned profile exists, use it
  if (existsSync(CLONED_PROFILE_DIR) && readdirSync(CLONED_PROFILE_DIR).length > 0) {
    console.log('📂 Using cloned Chrome profile:', CLONED_PROFILE_DIR);
    return CLONED_PROFILE_DIR;
  }

  // Auto-detect or use configured path
  const sourcePath = configuredPath === 'auto'
    ? getDefaultChromeUserDataDir()
    : configuredPath;

  if (!existsSync(sourcePath)) {
    console.warn('⚠️  Chrome profile not found at:', sourcePath);
    console.log('📂 Creating fresh profile at:', CLONED_PROFILE_DIR);
    mkdirSync(CLONED_PROFILE_DIR, { recursive: true });
    return CLONED_PROFILE_DIR;
  }

  return sourcePath;
}

/**
 * Clone the user's Chrome profile to avoid lock conflicts.
 * Copies essential files (cookies, localStorage, login data) while skipping
 * large caches and unnecessary directories.
 * @param {string} sourcePath - Source Chrome User Data directory
 * @returns {string} Path to the cloned profile
 */
export function cloneProfile(sourcePath = 'auto') {
  const source = sourcePath === 'auto' ? getDefaultChromeUserDataDir() : sourcePath;

  if (!existsSync(source)) {
    console.warn('⚠️  Source Chrome profile not found:', source);
    mkdirSync(CLONED_PROFILE_DIR, { recursive: true });
    return CLONED_PROFILE_DIR;
  }

  console.log('📋 Cloning Chrome profile...');
  console.log('   Source:', source);
  console.log('   Destination:', CLONED_PROFILE_DIR);

  // Create destination
  mkdirSync(CLONED_PROFILE_DIR, { recursive: true });

  // Files/dirs to copy from the root User Data dir
  const essentialRootFiles = [
    'Local State',
  ];

  // Copy essential root files
  for (const file of essentialRootFiles) {
    const srcFile = join(source, file);
    const dstFile = join(CLONED_PROFILE_DIR, file);
    if (existsSync(srcFile)) {
      try {
        cpSync(srcFile, dstFile, { force: true });
      } catch (err) {
        console.warn(`   ⚠️  Could not copy ${file}:`, err.message);
      }
    }
  }

  // Files to copy from the Default profile
  const essentialProfileFiles = [
    'Cookies',
    'Login Data',
    'Web Data',
    'Preferences',
    'Secure Preferences',
    'Bookmarks',
    'Favicons',
    'History',
    'Local Storage',
    'Session Storage',
    'IndexedDB',
    'Extension State',
    'Extensions',
  ];

  const defaultProfile = join(source, 'Default');
  const clonedDefault = join(CLONED_PROFILE_DIR, 'Default');

  if (existsSync(defaultProfile)) {
    mkdirSync(clonedDefault, { recursive: true });

    for (const item of essentialProfileFiles) {
      const srcItem = join(defaultProfile, item);
      const dstItem = join(clonedDefault, item);
      if (existsSync(srcItem)) {
        try {
          cpSync(srcItem, dstItem, { recursive: true, force: true });
        } catch (err) {
          console.warn(`   ⚠️  Could not copy ${item}:`, err.message);
        }
      }
    }
  }

  console.log('✅ Chrome profile cloned successfully!');
  return CLONED_PROFILE_DIR;
}

/**
 * Get the cloned profile directory path.
 */
export function getClonedProfileDir() {
  return CLONED_PROFILE_DIR;
}

/**
 * Check if a cloned profile already exists.
 */
export function hasClonedProfile() {
  return existsSync(CLONED_PROFILE_DIR) && readdirSync(CLONED_PROFILE_DIR).length > 0;
}

/**
 * Ensure data directories exist.
 */
export function ensureDataDirs() {
  const dirs = [
    DATA_DIR,
    join(DATA_DIR, 'screenshots'),
  ];
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
}
