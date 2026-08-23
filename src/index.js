/**
 * Pilot — Main Entry Point
 * Initializes all systems and starts the server.
 */

import 'dotenv/config';
import { createAppServer } from './server/index.js';
import { initGemini } from './ai/gemini.js';
import { initDatabase } from './storage/history.js';
import { ensureDataDirs } from './browser/profile.js';
import { setStatusCallback } from './browser/controller.js';

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

  // 4. Start the server
  const { httpServer, broadcast } = createAppServer(PORT);

  // 5. Set up browser status callback to broadcast changes
  setStatusCallback((status) => {
    broadcast({ type: 'browser_status', status });
  });

  httpServer.listen(PORT, () => {
    console.log('');
    console.log(`  🌐 Server running at: http://localhost:${PORT}`);
    console.log('  ─────────────────────────────');
    console.log('');

    // Auto-open browser
    openBrowser(`http://localhost:${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n🛑 Shutting down...');
    const { close } = await import('./browser/controller.js');
    await close();
    httpServer.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function openBrowser(url) {
  try {
    const open = (await import('open')).default;
    await open(url);
  } catch {
    console.log(`  Open your browser to: ${url}`);
  }
}

main().catch((err) => {
  console.error('❌ Failed to start Pilot:', err);
  process.exit(1);
});
