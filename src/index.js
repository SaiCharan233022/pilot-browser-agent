/**
 * Pilot — Main Entry Point
 * Initializes all systems and starts the server.
 */

import 'dotenv/config';
import dns from 'dns';
try { dns.setDefaultResultOrder('ipv4first'); } catch {}
import { createAppServer } from './server/index.js';
import { initGemini } from './ai/gemini.js';
import { initDatabase } from './storage/history.js';
import { ensureDataDirs } from './browser/profile.js';
import { setStatusCallback } from './browser/controller.js';
import { getInstalledApps } from './system/appLauncher.js';

const PORT = parseInt(process.env.PORT) || 3000;

async function main() {
  console.log('');
  console.log('  🧭  P I L O T');
  console.log('  ─────────────────────────────');
  console.log('  AI Browser Automation Agent');
  console.log('');

  // 1. Ensure data directories exist
  ensureDataDirs();
  console.log('📁 Data directories ready');

  // 2. Initialize database
  initDatabase();

  // 3. Initialize Gemini (if API key is available)
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey !== 'your_key_here') {
    initGemini(apiKey);
    console.log('🧠 Gemini AI initialized');
  } else {
    console.log('⚠️  No Gemini API key found. Set it in Settings after launching.');
  }

  // 4. Preload installed laptop applications
  await getInstalledApps();
  console.log('💻 Laptop installed apps indexed');

  // 4. Start the server
  const { httpServer, broadcast } = createAppServer(PORT);

  // 5. Set up browser status callback to broadcast changes
  setStatusCallback((status) => {
    broadcast({ type: 'browser_status', status });
  });

  // Pre-warm browser in background for zero-delay execution
  import('./browser/controller.js').then(b => {
    b.launch({ headless: process.env.HEADLESS === 'true' }).catch(() => {});
  });

  httpServer.listen(PORT, () => {
    console.log('');
    console.log(`  🌐 Server running at: http://localhost:${PORT}`);
    console.log('  ─────────────────────────────');
    console.log('');

    // Auto-open browser
    openBrowser(`http://localhost:${PORT}`);
  });

  // Keep process alive indefinitely
  setInterval(() => {}, 60000);

  // Prevent unexpected process exits
  process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught exception:', err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('⚠️ Unhandled rejection:', reason);
  });
}

async function openBrowser(url) {
  // Only attempt auto-open if in an interactive shell
  if (process.env.NO_AUTO_OPEN === 'true') return;
  try {
    const open = (await import('open')).default;
    await open(url, { wait: false });
  } catch {
    console.log(`  Open your browser to: ${url}`);
  }
}

main().catch((err) => {
  console.error('❌ Failed to start Pilot:', err);
});
