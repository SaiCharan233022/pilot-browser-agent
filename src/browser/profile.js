/**
 * Chrome Profile Manager
 * Detects, validates, cleans locks, and clones the user's Chrome profile.
 */

import { existsSync, mkdirSync, cpSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DATA_DIR = join(process.cwd(), 'data');
const CLONED_PROFILE_DIR = join(DATA_DIR, 'chrome-profile');

/**
 * Clean lock files from profile directory to prevent ProcessSingleton lock errors.
 */
export function cleanProfileLocks(dir = CLONED_PROFILE_DIR) {
  if (!existsSync(dir)) return;
  const lockNames = [
    'SingletonLock',
    'SingletonCookie',
    'SingletonSocket',
    'lockfile',
    'parent.lock',
    'chrome_shutdown_ms.txt',
    'Default/SingletonLock',
    'Default/lockfile',
  ];
  for (const name of lockNames) {
    const fullPath = join(dir, name);
    if (existsSync(fullPath)) {
      try {
        unlinkSync(fullPath);
      } catch { /* ok */ }
    }
  }
}

/**
 * Get the default Chrome user data directory for the current OS.
 */
function getDefaultChromeUserDataDir() {
  const home = homedir();
  return join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
}

/**
 * Detect and return the path to the Chrome user data directory.
 */
export function getProfilePath(configuredPath = 'auto') {
  cleanProfileLocks(CLONED_PROFILE_DIR);

  if (existsSync(CLONED_PROFILE_DIR) && readdirSync(CLONED_PROFILE_DIR).length > 0) {
    return CLONED_PROFILE_DIR;
  }

  const sourcePath = configuredPath === 'auto'
    ? getDefaultChromeUserDataDir()
    : configuredPath;

  if (!existsSync(sourcePath)) {
    mkdirSync(CLONED_PROFILE_DIR, { recursive: true });
    return CLONED_PROFILE_DIR;
  }

  return sourcePath;
}

/**
 * Clone the user's Chrome profile to avoid lock conflicts.
 */
export function cloneProfile(sourcePath = 'auto') {
  const source = sourcePath === 'auto' ? getDefaultChromeUserDataDir() : sourcePath;

  if (!existsSync(source)) {
    mkdirSync(CLONED_PROFILE_DIR, { recursive: true });
    return CLONED_PROFILE_DIR;
  }

  mkdirSync(CLONED_PROFILE_DIR, { recursive: true });

  const essentialRootFiles = ['Local State'];
  for (const file of essentialRootFiles) {
    const srcFile = join(source, file);
    const dstFile = join(CLONED_PROFILE_DIR, file);
    if (existsSync(srcFile)) {
      try {
        cpSync(srcFile, dstFile, { force: true });
      } catch { /* ok */ }
    }
  }

  const essentialProfileFiles = [
    'Cookies',
    'Login Data',
    'Web Data',
    'Preferences',
    'Bookmarks',
    'Local Storage',
    'Session Storage',
    'IndexedDB',
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
        } catch { /* ok */ }
      }
    }
  }

  cleanProfileLocks(CLONED_PROFILE_DIR);
  return CLONED_PROFILE_DIR;
}

export function getClonedProfileDir() {
  return CLONED_PROFILE_DIR;
}

export function hasClonedProfile() {
  return existsSync(CLONED_PROFILE_DIR) && readdirSync(CLONED_PROFILE_DIR).length > 0;
}

export function ensureDataDirs() {
  const dirs = [
    DATA_DIR,
    join(DATA_DIR, 'screenshots'),
  ];
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
}
