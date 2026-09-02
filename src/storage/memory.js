/**
 * Pilot Memory System
 * Provides Short-Term Context, Multi-turn Conversation Memory,
 * Full Input History Logging, and Persistent Knowledge/Preferences tracking across agent runs.
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

    CREATE TABLE IF NOT EXISTS user_knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'fact',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_turns_created ON conversation_turns(created_at);
    CREATE INDEX IF NOT EXISTS idx_knowledge_key ON user_knowledge(key);
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
 * Automatically saves EVERY user input and assistant response.
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

    if (role === 'user') {
      setMemory('last_user_input', text, 'history');
    }
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
export function getRecentTurns(limit = 10) {
  if (!memoryDb) initMemory();
  try {
    const rows = memoryDb.prepare(`
      SELECT id, role, text, intent, target, metadata, created_at
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
 * Get the most recent assistant output from conversation turns.
 */
export function getLastAgentOutput() {
  if (!memoryDb) initMemory();
  try {
    const row = memoryDb.prepare(`
      SELECT text, metadata
      FROM conversation_turns
      WHERE role = 'assistant'
      ORDER BY id DESC
      LIMIT 1
    `).get();
    return row ? row.text : null;
  } catch (err) {
    return null;
  }
}

/**
 * Get all user inputs from conversation history.
 */
export function getUserInputs(limit = 25) {
  if (!memoryDb) initMemory();
  try {
    return memoryDb.prepare(`
      SELECT id, text, created_at
      FROM conversation_turns
      WHERE role = 'user'
      ORDER BY id DESC
      LIMIT ?
    `).all(limit);
  } catch (err) {
    return [];
  }
}

/**
 * Search past conversation turns by query.
 */
export function searchConversationHistory(query, limit = 20) {
  if (!memoryDb) initMemory();
  try {
    const q = `%${(query || '').trim().toLowerCase()}%`;
    return memoryDb.prepare(`
      SELECT id, role, text, created_at
      FROM conversation_turns
      WHERE LOWER(text) LIKE ?
      ORDER BY id DESC
      LIMIT ?
    `).all(q, limit);
  } catch (err) {
    return [];
  }
}

/**
 * Get the most recently referenced target entity.
 */
export function getLastActiveTarget() {
  return getMemory('last_target', null);
}

/**
 * Save persistent knowledge or user preference.
 */
export function saveKnowledge(key, content, category = 'fact') {
  if (!memoryDb) initMemory();
  try {
    const cleanKey = (key || '').trim().toLowerCase();
    const cleanContent = (content || '').trim();
    const now = new Date().toISOString();
    const stmt = memoryDb.prepare(`
      INSERT INTO user_knowledge (key, content, category, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        content = excluded.content,
        category = excluded.category,
        updated_at = excluded.updated_at
    `);
    stmt.run(cleanKey, cleanContent, category, now, now);
    return { success: true, key: cleanKey, content: cleanContent };
  } catch (err) {
    console.error('Failed to save knowledge:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Recall a specific piece of knowledge by key.
 */
export function recallKnowledge(key) {
  if (!memoryDb) initMemory();
  try {
    const cleanKey = (key || '').trim().toLowerCase();
    const row = memoryDb.prepare('SELECT * FROM user_knowledge WHERE key = ? OR key LIKE ?').get(cleanKey, `%${cleanKey}%`);
    return row || null;
  } catch (err) {
    return null;
  }
}

/**
 * Get all stored knowledge entries.
 */
export function getAllKnowledge(limit = 50) {
  if (!memoryDb) initMemory();
  try {
    return memoryDb.prepare('SELECT key, content, category, updated_at FROM user_knowledge ORDER BY id DESC LIMIT ?').all(limit);
  } catch (err) {
    return [];
  }
}

/**
 * Search knowledge by keyword.
 */
export function searchKnowledge(query) {
  if (!memoryDb) initMemory();
  try {
    const q = `%${(query || '').trim().toLowerCase()}%`;
    return memoryDb.prepare('SELECT key, content, category FROM user_knowledge WHERE key LIKE ? OR content LIKE ?').all(q, q);
  } catch (err) {
    return [];
  }
}

/**
 * Forget/delete a stored knowledge entry.
 */
export function forgetKnowledge(key) {
  if (!memoryDb) initMemory();
  try {
    const cleanKey = (key || '').trim().toLowerCase();
    const res = memoryDb.prepare('DELETE FROM user_knowledge WHERE key = ? OR key LIKE ?').run(cleanKey, `%${cleanKey}%`);
    return { success: res.changes > 0, changes: res.changes };
  } catch (err) {
    return { success: false, error: err.message };
  }
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
