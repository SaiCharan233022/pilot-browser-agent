/**
 * Express + WebSocket Server
 * REST API endpoints and real-time WebSocket communication for the chat UI.
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { getAllTasks, getTask, getTaskSteps } from '../storage/history.js';
import { runTask, approveAction, rejectAction, cancelTask, setBroadcast } from '../executor/taskRunner.js';
import { initGemini, isGeminiReady } from '../ai/gemini.js';
import { writeFileContent } from '../system/fileExplorer.js';
import * as browser from '../browser/controller.js';

const app = express();
app.use(express.json());

// Serve static files (the chat UI)
app.use(express.static(join(process.cwd(), 'public')));

// Serve screenshots
app.use('/screenshots', express.static(join(process.cwd(), 'data', 'screenshots')));

// === REST API ===

/**
 * GET /api/tasks — List all past tasks.
 */
app.get('/api/tasks', (req, res) => {
  const tasks = getAllTasks(parseInt(req.query.limit) || 50);
  res.json({ tasks });
});

/**
 * GET /api/tasks/:id — Get task details with steps.
 */
app.get('/api/tasks/:id', (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({ task });
});

/**
 * GET /api/tasks/:id/steps — Get steps for a task.
 */
app.get('/api/tasks/:id/steps', (req, res) => {
  const steps = getTaskSteps(req.params.id);
  res.json({ steps });
});

/**
 * POST /api/files/save — Save manual edits to a file.
 */
app.post('/api/files/save', async (req, res) => {
  const { filePath, content } = req.body;
  if (!filePath) return res.status(400).json({ error: 'filePath is required' });
  const result = await writeFileContent(filePath, content || '');
  res.json(result);
});

/**
 * POST /api/settings — Update settings.
 */
app.post('/api/settings', (req, res) => {
  const envPath = join(process.cwd(), '.env');
  const settings = req.body;

  let envContent = '';
  if (existsSync(envPath)) {
    envContent = readFileSync(envPath, 'utf-8');
  }

  // Update or add each setting
  const envMap = {};
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && key.trim()) {
      envMap[key.trim()] = valueParts.join('=').trim();
    }
  });

  if (settings.apiKey) {
    envMap.GEMINI_API_KEY = settings.apiKey;
    // Re-initialize Gemini with new key
    initGemini(settings.apiKey);
  }
  if (settings.headless !== undefined) {
    envMap.HEADLESS = String(settings.headless);
  }
  if (settings.port) {
    envMap.PORT = String(settings.port);
  }

  // Write back
  const newContent = Object.entries(envMap)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  writeFileSync(envPath, newContent);

  res.json({ success: true, message: 'Settings saved' });
});

/**
 * GET /api/settings — Get current settings.
 */
app.get('/api/settings', (req, res) => {
  const envPath = join(process.cwd(), '.env');
  const settings = {
    hasApiKey: false,
    headless: false,
    port: process.env.PORT || 3000,
    browserRunning: browser.isRunning(),
  };

  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const [key, ...vals] = line.split('=');
      const value = vals.join('=').trim();
      if (key?.trim() === 'GEMINI_API_KEY' && value && value !== 'your_key_here') {
        settings.hasApiKey = true;
      }
      if (key?.trim() === 'HEADLESS') {
        settings.headless = value === 'true';
      }
    });
  }

  settings.geminiReady = isGeminiReady();
  res.json(settings);
});

/**
 * GET /api/status — Server & browser status.
 */
app.get('/api/status', (req, res) => {
  res.json({
    server: 'running',
    browser: browser.isRunning() ? 'open' : 'closed',
    gemini: isGeminiReady() ? 'ready' : 'not configured',
  });
});

/**
 * GET /api/memory — Get stored personal facts and input history.
 */
app.get('/api/memory', async (req, res) => {
  try {
    const { getAllKnowledge, getUserInputs } = await import('../storage/memory.js');
    const facts = getAllKnowledge(50);
    const inputs = getUserInputs(30);
    res.json({ success: true, facts, inputs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// === WebSocket Server ===

/**
 * Create and configure the HTTP + WebSocket server.
 * @param {number} port - Port to listen on
 * @returns {Object} - { httpServer, wss }
 */
export function createAppServer(port = 3000) {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  // Connected clients
  const clients = new Set();

  // Broadcast to all connected clients
  function broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === 1) { // OPEN
        client.send(data);
      }
    }
  }

  // Set the broadcast function for the task runner
  setBroadcast(broadcast);

  // Handle WebSocket connections
  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`👤 Client connected (${clients.size} total)`);

    // Send initial status
    ws.send(JSON.stringify({
      type: 'connected',
      browser: browser.isRunning() ? 'open' : 'closed',
      gemini: isGeminiReady() ? 'ready' : 'not configured',
    }));

    // Handle incoming messages from the UI
    ws.on('message', async (rawData) => {
      try {
        const message = JSON.parse(rawData.toString());
        await handleClientMessage(message, broadcast);
      } catch (err) {
        console.error('Error handling client message:', err);
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`👤 Client disconnected (${clients.size} total)`);
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
      clients.delete(ws);
    });
  });

  return { httpServer, wss, broadcast };
}

/**
 * Handle messages from WebSocket clients.
 */
async function handleClientMessage(message, broadcast) {
  switch (message.type) {
    case 'command': {
      // Run the task (this is async and broadcasts progress via WebSocket)
      runTask(message.text, {
        headless: message.headless ?? (process.env.HEADLESS === 'true'),
        profilePath: process.env.CHROME_PROFILE_PATH || 'auto',
      }).catch(err => {
        broadcast({ type: 'error', message: `Task failed: ${err.message}` });
      });
      break;
    }

    case 'approve': {
      approveAction(message.taskId, message.stepId);
      break;
    }

    case 'reject': {
      rejectAction(message.taskId, message.stepId);
      break;
    }

    case 'cancel': {
      cancelTask(message.taskId);
      break;
    }

    case 'close_browser': {
      await browser.close();
      broadcast({ type: 'browser_status', status: 'closed' });
      break;
    }

    case 'set_api_key': {
      if (message.apiKey) {
        initGemini(message.apiKey);
        // Save to .env
        const envPath = join(process.cwd(), '.env');
        let content = '';
        if (existsSync(envPath)) {
          content = readFileSync(envPath, 'utf-8');
        }
        if (content.includes('GEMINI_API_KEY=')) {
          content = content.replace(/GEMINI_API_KEY=.*/, `GEMINI_API_KEY=${message.apiKey}`);
        } else {
          content += `\nGEMINI_API_KEY=${message.apiKey}`;
        }
        writeFileSync(envPath, content);
        broadcast({ type: 'settings_updated', gemini: 'ready' });
      }
      break;
    }

    default:
      console.warn('Unknown message type:', message.type);
  }
}
