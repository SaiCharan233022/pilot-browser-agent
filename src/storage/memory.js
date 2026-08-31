/**
 * Pilot Memory System
 * Provides Short-Term Context, Multi-turn Conversation Memory,
 * and Persistent Knowledge/Preferences tracking across agent runs.
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync } from 'fs';

let memoryDb = null;

/**
 * Initialize the memory tables in the SQLite database.
 */
export function initMemory(dbInstance = null) {
  if (dbInstance) {
    memoryDb = dbInstance;
  } else if (!memoryDb) {
    const dataDir = join(process.cwd(), 'data');
    mkdirSync(dataDir, { recursive: true });
    const dbPath = join(dataDir, 'history.db');
    memoryDb = new Database(dbPath);
    memoryDb.pragma('journal_mode = WAL');
  }

  memoryDb.exec(`
    CREATE TABLE IF NOT EXISTS agent_memory (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      category TEXT DEFAULT 'context',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      intent TEXT,
      target TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_turns_created ON conversation_turns(created_at);
  `);
}

/**
 * Set a key-value pair in agent memory.
 */
export function setMemory(key, value, category = 'context') {
  if (!memoryDb) initMemory();
  try {
    const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
    const stmt = memoryDb.prepare(`
      INSERT OR REPLACE INTO agent_memory (key, value, category, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(key, serialized, category, new Date().toISOString());
  } catch (err) {
    console.error('Failed to set memory:', err.message);
  }
}

/**
 * Get a value from agent memory by key.
 */
export function getMemory(key, defaultValue = null) {
  if (!memoryDb) initMemory();
  try {
    const row = memoryDb.prepare('SELECT value FROM agent_memory WHERE key = ?').get(key);
    if (!row) return defaultValue;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  } catch (err) {
    return defaultValue;
  }
}

/**
 * Record a conversation turn into memory for context tracking.
 */
export function recordTurn(role, text, { intent = null, target = null, metadata = {} } = {}) {
  if (!memoryDb) initMemory();
  try {
    const stmt = memoryDb.prepare(`
      INSERT INTO conversation_turns (role, text, intent, target, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      role,
      text,
      intent,
      target,
      JSON.stringify(metadata),
      new Date().toISOString()
    );

    // If a target was involved, update last active target memory
    if (target) {
      setMemory('last_target', target, 'context');
    }
    if (intent) {
      setMemory('last_intent', intent, 'context');
    }
  } catch (err) {
    console.error('Failed to record turn:', err.message);
  }
}

/**
 * Get recent conversation turns for context-aware multi-turn reasoning.
 */
export function getRecentTurns(limit = 6) {
  if (!memoryDb) initMemory();
  try {
    const rows = memoryDb.prepare(`
      SELECT role, text, intent, target, metadata, created_at
      FROM conversation_turns
      ORDER BY id DESC
      LIMIT ?
    `).all(limit);
    return rows.reverse();
  } catch (err) {
    return [];
  }
}

/**
 * Get the most recently referenced target entity (e.g. app name, website, search query).
 */
export function getLastActiveTarget() {
  return getMemory('last_target', null);
}

/**
 * Clear conversation memory (for testing or user request).
 */
export function clearConversationMemory() {
  if (!memoryDb) initMemory();
  try {
    memoryDb.exec('DELETE FROM conversation_turns; DELETE FROM agent_memory WHERE category = "context";');
  } catch {}
}
