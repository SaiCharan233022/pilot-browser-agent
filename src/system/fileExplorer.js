/**
 * Pilot Filesystem Intelligence & Exploration Tool
 * Provides safe local file search, file reading, and directory listing.
 */

import { promises as fs } from 'fs';
import { join, resolve, extname, basename, isAbsolute } from 'path';
import { homedir } from 'os';

const COMMON_DIRS = {
  downloads: join(homedir(), 'Downloads'),
  desktop: join(homedir(), 'Desktop'),
  documents: join(homedir(), 'Documents'),
  workspace: process.cwd(),
  project: process.cwd(),
};

/**
 * Resolve target base directory safely.
 */
export function resolveDirectory(dirQuery = 'project') {
  const normalized = (dirQuery || '').trim().toLowerCase();
  if (COMMON_DIRS[normalized]) {
    return COMMON_DIRS[normalized];
  }
  if (isAbsolute(dirQuery)) {
    return resolve(dirQuery);
  }
  return resolve(process.cwd(), dirQuery);
}

/**
 * Recursively search for files matching a pattern or extension.
 */
export async function searchFiles(pattern = '*', baseDirQuery = 'project', maxResults = 25) {
  const targetDir = resolveDirectory(baseDirQuery);
  const results = [];
  const cleanPattern = (pattern || '*').trim().toLowerCase();
  const isExtension = cleanPattern.startsWith('.');
  const isWildcardExt = cleanPattern.startsWith('*.');
  const targetExt = isWildcardExt ? cleanPattern.slice(1) : (isExtension ? cleanPattern : null);

  async function crawl(dir, depth = 0) {
    if (depth > 5 || results.length >= maxResults) return;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxResults) break;
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;

        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await crawl(fullPath, depth + 1);
        } else if (entry.isFile()) {
          const lowerName = entry.name.toLowerCase();
          const fileExt = extname(lowerName);

          let matches = false;
          if (cleanPattern === '*' || cleanPattern === '*.*') {
            matches = true;
          } else if (targetExt && fileExt === targetExt) {
            matches = true;
          } else if (lowerName.includes(cleanPattern.replace(/\*/g, ''))) {
            matches = true;
          }

          if (matches) {
            try {
              const stat = await fs.stat(fullPath);
              results.push({
                name: entry.name,
                path: fullPath,
                relativePath: fullPath.replace(process.cwd(), '').replace(/^[\\\/]/, '') || entry.name,
                size: formatBytes(stat.size),
                modified: stat.mtime.toISOString().split('T')[0],
              });
            } catch {}
          }
        }
      }
    } catch {}
  }

  await crawl(targetDir);
  return {
    success: true,
    directory: targetDir,
    query: pattern,
    count: results.length,
    files: results,
  };
}

/**
 * Safely read file content with line capping.
 */
export async function readFileContent(filePath, maxLines = 150) {
  try {
    let resolvedPath = filePath;
    if (!isAbsolute(filePath)) {
      resolvedPath = resolve(process.cwd(), filePath);
    }

    const stat = await fs.stat(resolvedPath);
    if (stat.isDirectory()) {
      return { success: false, error: `${filePath} is a directory, not a file.` };
    }
    if (stat.size > 2 * 1024 * 1024) {
      return { success: false, error: `File too large (${formatBytes(stat.size)}). Max allowed is 2MB.` };
    }

    const raw = await fs.readFile(resolvedPath, 'utf8');
    const lines = raw.split('\n');
    const truncated = lines.length > maxLines;
    const content = lines.slice(0, maxLines).join('\n');

    return {
      success: true,
      path: resolvedPath,
      name: basename(resolvedPath),
      totalLines: lines.length,
      displayedLines: Math.min(lines.length, maxLines),
      truncated,
      size: formatBytes(stat.size),
      content,
    };
  } catch (err) {
    return { success: false, path: filePath, error: `Could not read file: ${err.message}` };
  }
}

/**
 * List files and directories in a given folder.
 */
export async function listDirectory(dirQuery = 'project') {
  try {
    const targetDir = resolveDirectory(dirQuery);
    const entries = await fs.readdir(targetDir, { withFileTypes: true });

    const items = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      items.push({
        name: entry.name,
        type: entry.isDirectory() ? 'folder' : 'file',
        path: join(targetDir, entry.name),
      });
    }

    return {
      success: true,
      directory: targetDir,
      totalItems: items.length,
      items: items.slice(0, 50),
    };
  } catch (err) {
    return { success: false, error: `Could not list directory: ${err.message}` };
  }
}

/**
 * Safely create or edit a file with content.
 */
export async function writeFileContent(filePath, content = '', append = false, baseDirQuery = 'project') {
  try {
    let resolvedPath = filePath;
    if (!isAbsolute(filePath)) {
      const baseDir = resolveDirectory(baseDirQuery);
      resolvedPath = resolve(baseDir, filePath);
    }

    // Safety checks against critical system files
    const lower = resolvedPath.toLowerCase();
    if (lower.includes('c:\\windows') || lower.includes('c:\\program files') || lower.endsWith('.exe') || lower.endsWith('.dll')) {
      return { success: false, error: 'Writing to system directories or binary executables is blocked for safety.' };
    }

    const parentDir = resolve(resolvedPath, '..');
    await fs.mkdir(parentDir, { recursive: true });

    if (append) {
      await fs.appendFile(resolvedPath, content, 'utf8');
    } else {
      await fs.writeFile(resolvedPath, content, 'utf8');
    }

    const stat = await fs.stat(resolvedPath);
    return {
      success: true,
      path: resolvedPath,
      name: basename(resolvedPath),
      size: formatBytes(stat.size),
      action: append ? 'appended' : 'created',
      message: `File "${basename(resolvedPath)}" ${append ? 'appended' : 'saved'} successfully (${formatBytes(stat.size)}).`,
    };
  } catch (err) {
    return { success: false, path: filePath, error: `Could not write file: ${err.message}` };
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

