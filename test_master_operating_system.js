import 'dotenv/config';
import dns from 'dns';
try { dns.setDefaultResultOrder('ipv4first'); } catch {}
import { runTask } from './src/executor/taskRunner.js';
import { initGemini } from './src/ai/gemini.js';
import { getInstalledApps } from './src/system/appLauncher.js';
import { initMemory } from './src/storage/memory.js';

initGemini(process.env.GEMINI_API_KEY);
initMemory();
await getInstalledApps();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

console.log('====================================================');
console.log('🌐 PILOT PERSONAL AI OS — MASTER CAPABILITY SUITE');
console.log('====================================================\n');

let passed = 0;
let total = 0;

async function test(category, cmd, validator) {
  total++;
  console.log(`▶ [${total}] [${category}] Testing: "${cmd}"...`);
  try {
    const res = await runTask(cmd);
    const ok = validator(res);
    if (ok) {
      console.log(`   ✅ PASS: ${res.summary.split('\n')[0]}`);
      passed++;
    } else {
      console.error(`   ❌ FAIL: Unexpected result:`, res.summary);
    }
  } catch (err) {
    console.error(`   ❌ ERROR:`, err.message);
  }
  await sleep(600);
}

// 1. Safe Terminal Sandbox
await test(
  'Terminal Sandbox',
  'run command git status',
  (r) => r.success && (r.summary.includes('branch') || r.summary.includes('fatal') || r.summary.includes('Command:'))
);

// 2. Terminal Echo
await test(
  'Terminal Echo',
  'run command echo "PILOT_ENGINE_ACTIVE"',
  (r) => r.success && r.summary.includes('PILOT_ENGINE_ACTIVE')
);

// 3. Knowledge Memory
await test(
  'Knowledge Memory',
  'remember that my secret code is 7890',
  (r) => r.success && r.summary.includes('7890')
);

// 4. Knowledge Recall
await test(
  'Knowledge Recall',
  'what is my secret code?',
  (r) => r.success && r.summary.includes('7890')
);

// 5. Input History
await test(
  'Input History',
  'show my input history',
  (r) => r.success && (r.summary.includes('recent inputs') || r.summary.includes('1.'))
);

// 6. Filesystem Search
await test(
  'File Search',
  'find files named *.js in src',
  (r) => r.success && r.summary.includes('fileExplorer.js')
);

// 7. File Read
await test(
  'File Read',
  'read file package.json',
  (r) => r.success && r.summary.includes('pilot-browser-agent')
);

// 8. Directory List
await test(
  'Directory List',
  'list files in src/system',
  (r) => r.success && r.summary.includes('terminalRunner.js')
);

// 9. Master Volume Control
await test(
  'Volume Control',
  'set volume to 42%',
  (r) => r.success && r.summary.includes('42%')
);

// 10. Volume Status
await test(
  'Volume Status',
  'what is the volume',
  (r) => r.success && (r.summary.includes('Master volume') || r.summary.includes('42%'))
);

// 11. Laptop App Launch
await test(
  'Laptop App Launch',
  'open calculator',
  (r) => r.success && r.summary.includes('calculator')
);

// 12. Contextual Close
await test(
  'Contextual Close',
  'close it',
  (r) => r.success && r.summary.includes('Closed')
);

// 13. Universal Website
await test(
  'Universal Website',
  'open gemini',
  (r) => r.success && r.summary.includes('screen')
);

console.log('\n====================================================');
console.log(`📊 MASTER TEST RESULTS: ${passed} / ${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
console.log('====================================================\n');

if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
