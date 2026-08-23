/**
 * Pilot — First-Run Setup Script
 * Detects Chrome profile, clones it, and sets up the environment.
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';
import { cloneProfile, hasClonedProfile, ensureDataDirs, getProfilePath } from '../src/browser/profile.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

async function setup() {
  console.log('');
  console.log('  🧭 P I L O T — Setup');
  console.log('  ─────────────────────────────');
  console.log('');

  // 1. Ensure data directories
  ensureDataDirs();
  console.log('✅ Data directories created');

  // 2. Create .env file
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    const examplePath = join(process.cwd(), '.env.example');
    if (existsSync(examplePath)) {
      copyFileSync(examplePath, envPath);
    } else {
      writeFileSync(envPath, 'GEMINI_API_KEY=your_key_here\nCHROME_PROFILE_PATH=auto\nPORT=3000\nHEADLESS=false\n');
    }
    console.log('✅ .env file created');
  } else {
    console.log('✅ .env file already exists');
  }

  // 3. Gemini API Key
  const envContent = readFileSync(envPath, 'utf-8');
  if (!envContent.includes('GEMINI_API_KEY=') || envContent.includes('your_key_here')) {
    console.log('');
    console.log('  You need a Gemini API key to power Pilot\'s brain.');
    console.log('  Get one free at: https://aistudio.google.com');
    console.log('');

    const apiKey = await ask('  Paste your Gemini API key (or press Enter to skip): ');
    if (apiKey.trim()) {
      let content = readFileSync(envPath, 'utf-8');
      content = content.replace(/GEMINI_API_KEY=.*/, `GEMINI_API_KEY=${apiKey.trim()}`);
      writeFileSync(envPath, content);
      console.log('✅ API key saved');
    } else {
      console.log('⏭️  Skipped. You can set it later in the Settings panel.');
    }
  } else {
    console.log('✅ Gemini API key configured');
  }

  // 4. Chrome Profile
  if (!hasClonedProfile()) {
    console.log('');
    console.log('  Cloning your Chrome profile so the agent can use your saved logins...');
    console.log('  ⚠️  Please close ALL Chrome windows before continuing.');
    console.log('');

    const proceed = await ask('  Ready to clone? (y/n): ');
    if (proceed.toLowerCase() === 'y') {
      try {
        cloneProfile('auto');
      } catch (err) {
        console.error('  ❌ Failed to clone profile:', err.message);
        console.log('  📝 The agent will create a fresh profile instead.');
      }
    } else {
      console.log('  ⏭️  Skipped. Agent will use a fresh browser profile.');
      getProfilePath('auto'); // Creates fresh profile dir
    }
  } else {
    console.log('✅ Chrome profile already cloned');
  }

  // 5. Install Playwright browsers
  console.log('');
  console.log('  Installing Playwright browser dependencies...');
  console.log('  (This may take a minute on first run)');

  const { execSync } = await import('child_process');
  try {
    execSync('npx playwright install chromium', { stdio: 'inherit', cwd: process.cwd() });
    console.log('✅ Playwright browsers installed');
  } catch (err) {
    console.warn('⚠️  Playwright install had issues. The agent will try to use your installed Chrome.');
  }

  console.log('');
  console.log('  ─────────────────────────────');
  console.log('  ✅ Setup complete!');
  console.log('');
  console.log('  Run "npm start" to launch Pilot.');
  console.log('');

  rl.close();
}

setup().catch((err) => {
  console.error('Setup failed:', err);
  rl.close();
  process.exit(1);
});
