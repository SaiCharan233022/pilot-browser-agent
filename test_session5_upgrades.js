import 'dotenv/config';
import dns from 'dns';
try { dns.setDefaultResultOrder('ipv4first'); } catch {}
import { runTask } from './src/executor/taskRunner.js';
import { initGemini } from './src/ai/gemini.js';
import { getInstalledApps } from './src/system/appLauncher.js';
import { initMemory } from './src/storage/memory.js';
import { promises as fs } from 'fs';

initGemini(process.env.GEMINI_API_KEY);
initMemory();
await getInstalledApps();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

console.log('====================================================');
console.log('🚀 PILOT SESSION 5 — UPGRADES & REGRESSION SUITE');
console.log('====================================================\n');

// Prepare sample CSV and JSON files for document intelligence testing
await fs.writeFile('sample_data.csv', 'id,name,role,salary\n1,Alice,Engineer,120000\n2,Bob,Designer,95000\n3,Charlie,Product,130000', 'utf8');
await fs.writeFile('sample_config.json', JSON.stringify({ app: "Pilot", version: "1.5.0", active: true }, null, 2), 'utf8');

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
  await sleep(400);
}

// === NEW FEATURES IN SESSION 5 ===

// 1. Safe File Creation
await test(
  'File Creator',
  'create file audit_notes.txt with content Hello World from Pilot Personal OS',
  (r) => r.success && (r.summary.includes('File Saved') || r.summary.includes('audit_notes.txt'))
);

// 2. File Reading
await test(
  'File Reader',
  'read file audit_notes.txt',
  (r) => r.success && r.summary.includes('Hello World from Pilot')
);

// 3. CSV Document Intelligence
await test(
  'Document CSV',
  'read spreadsheet sample_data.csv',
  (r) => r.success && (r.summary.includes('Alice') || r.summary.includes('Engineer') || r.summary.includes('3 rows'))
);

// 4. JSON Document Intelligence
await test(
  'Document JSON',
  'read document sample_config.json',
  (r) => r.success && (r.summary.includes('Pilot') || r.summary.includes('1.5.0'))
);

// === FULL REGRESSION TEST SUITE (OLD FEATURES) ===

// 5. Terminal Sandbox
await test(
  'Terminal Sandbox',
  'run command git status',
  (r) => r.success && (r.summary.includes('branch') || r.summary.includes('Command:') || r.summary.includes('On branch'))
);

// 6. Knowledge Memory: Save
await test(
  'Knowledge Memory',
  'remember that my dog name is Bruno',
  (r) => r.success && r.summary.toLowerCase().includes('bruno')
);

// 7. Knowledge Memory: Recall
await test(
  'Knowledge Recall',
  'what is my dog name?',
  (r) => r.success && r.summary.toLowerCase().includes('bruno')
);

// 8. Continuous Input History
await test(
  'Input History',
  'show my input history',
  (r) => r.success && (r.summary.includes('recent inputs') || r.summary.includes('1.'))
);

// 9. Filesystem Search
await test(
  'File Search',
  'find files named *.js in src',
  (r) => r.success && r.summary.includes('documentParser.js')
);

// 10. Volume Setting
await test(
  'Volume Setting',
  'set volume to 38%',
  (r) => r.success && r.summary.includes('38%')
);

// 11. Volume Status
await test(
  'Volume Status',
  'what is the volume',
  (r) => r.success && (r.summary.includes('Master volume') || r.summary.includes('38%'))
);

// 12. Native App Launch
await test(
  'App Launch',
  'open calculator',
  (r) => r.success && r.summary.includes('calculator')
);

// 13. Contextual Close
await test(
  'Contextual Close',
  'close it',
  (r) => r.success && r.summary.includes('Closed')
);

// 14. Universal Website
await test(
  'Universal Website',
  'open gemini',
  (r) => r.success && r.summary.includes('gemini')
);

console.log('\n====================================================');
console.log(`📊 SESSION 5 TEST RESULTS: ${passed} / ${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
console.log('====================================================\n');

if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
