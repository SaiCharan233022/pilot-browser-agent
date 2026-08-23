/**
 * Task History — SQLite-based storage for task history and step logs.
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync } from 'fs';

let db = null;

/**
 * Initialize the database.
 */
export function initDatabase() {
  const dataDir = join(process.cwd(), 'data');
  mkdirSync(dataDir, { recursive: true });

  const dbPath = join(dataDir, 'history.db');
  db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      summary TEXT,
      plan TEXT,
      status TEXT DEFAULT 'planned',
      ai_summary TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      step_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      description TEXT,
      selector TEXT,
      status TEXT DEFAULT 'pending',
      result TEXT,
      screenshot_file TEXT,
      error TEXT,
      timestamp TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );

    CREATE INDEX IF NOT EXISTS idx_steps_task ON steps(task_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
  `);

  console.log('📦 Database initialized');
}

/**
 * Save a new task.
 */
export function saveTask(plan) {
  if (!db) return;

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO tasks (id, command, summary, plan, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    plan.taskId,
    plan.command,
    plan.summary,
    JSON.stringify(plan),
    plan.status || 'planned',
    plan.createdAt || new Date().toISOString()
  );
}

/**
 * Save or update a step.
 */
export function saveStep(taskId, step) {
  if (!db) return;

  // Check if step exists
  const existing = db.prepare(
    'SELECT id FROM steps WHERE task_id = ? AND step_id = ?'
  ).get(taskId, step.id);

  if (existing) {
    db.prepare(`
      UPDATE steps SET status = ?, result = ?, screenshot_file = ?, error = ?, timestamp = ?
      WHERE task_id = ? AND step_id = ?
    `).run(
      step.status,
      step.result ? JSON.stringify(step.result) : null,
      step.screenshot || null,
      step.result?.error || null,
      step.timestamp || new Date().toISOString(),
      taskId,
      step.id
    );
  } else {
    db.prepare(`
      INSERT INTO steps (task_id, step_id, action, description, selector, status, result, screenshot_file, error, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      taskId,
      step.id,
      step.action,
      step.description,
      step.selector || null,
      step.status || 'pending',
      step.result ? JSON.stringify(step.result) : null,
      step.screenshot || null,
      step.result?.error || null,
      step.timestamp || new Date().toISOString()
    );
  }
}

/**
 * Update a task's status.
 */
export function updateTaskStatus(taskId, status, summary = null) {
  if (!db) return;

  if (summary) {
    db.prepare(`
      UPDATE tasks SET status = ?, ai_summary = ?, completed_at = ? WHERE id = ?
    `).run(status, summary, new Date().toISOString(), taskId);
  } else {
    db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, taskId);
  }
}

/**
 * Get a task by ID with all its steps.
 */
export function getTask(taskId) {
  if (!db) return null;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return null;

  const steps = db.prepare(
    'SELECT * FROM steps WHERE task_id = ? ORDER BY step_id'
  ).all(taskId);

  return {
    ...task,
    plan: task.plan ? JSON.parse(task.plan) : null,
    steps: steps.map(s => ({
      ...s,
      result: s.result ? JSON.parse(s.result) : null,
    })),
  };
}

/**
 * Get all tasks (most recent first).
 */
export function getAllTasks(limit = 50) {
  if (!db) return [];

  return db.prepare(`
    SELECT id, command, summary, status, ai_summary, created_at, completed_at
    FROM tasks ORDER BY created_at DESC LIMIT ?
  `).all(limit);
}

/**
 * Get steps for a task.
 */
export function getTaskSteps(taskId) {
  if (!db) return [];

  return db.prepare(
    'SELECT * FROM steps WHERE task_id = ? ORDER BY step_id'
  ).all(taskId).map(s => ({
    ...s,
    result: s.result ? JSON.parse(s.result) : null,
  }));
}
