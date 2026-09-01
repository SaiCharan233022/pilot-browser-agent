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
console.log('🌐 PILOT COMPLETE PERSONAL AI OS — MASTER TEST SUITE');
console.log('====================================================\n');

// Prepare sample CSV and JSON files for document tests
await fs.writeFile('test_inventory.csv', 'sku,product,stock,price\n101,Keyboard,45,89.99\n102,Mouse,120,49.99\n103,Monitor,18,299.99', 'utf8');
await fs.writeFile('test_app_settings.json', JSON.stringify({ system: "PilotOS", version: "2.0.0", mode: "autonomous" }, null, 2), 'utf8');

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

// 1. Safe File Creation
await test(
  'File Creation',
  'create file sprint_plan.txt with content Sprint 5 Autonomous AI Operating Layer ready',
  (r) => r.success && (r.summary.includes('File Saved') || r.summary.includes('sprint_plan.txt'))
);

// 2. File Reading
await test(
  'File Reading',
  'read file sprint_plan.txt',
  (r) => r.success && r.summary.includes('Autonomous AI Operating Layer')
);

// 3. Document Spreadsheet Intelligence (CSV)
await test(
  'Document CSV',
  'read spreadsheet test_inventory.csv',
  (r) => r.success && (r.summary.includes('Keyboard') || r.summary.includes('3 rows'))
);

// 4. Document JSON Intelligence
await test(
  'Document JSON',
  'read document test_app_settings.json',
  (r) => r.success && (r.summary.includes('PilotOS') || r.summary.includes('2.0.0'))
);

// 5. Compound Multi-Step Workflow
await test(
  'Workflow Automation',
  'start coding mode',
  (r) => r.success && (r.summary.includes('Coding Setup Ready') || r.summary.includes('Volume set to 30%'))
);

// 6. System Health & Hardware Inspector
await test(
  'System Hardware',
  'system info',
  (r) => r.success && (r.summary.includes('RAM:') || r.summary.includes('CPU:') || r.summary.includes('Battery:'))
);

// 7. Battery Query
await test(
  'Battery Inspector',
  'battery status',
  (r) => r.success && (r.summary.includes('Battery:') || r.summary.includes('%') || r.summary.includes('AC'))
);

// 8. Clipboard Copy
await test(
  'Clipboard Set',
  'copy to clipboard: Pilot_Secret_Key_9988',
  (r) => r.success && r.summary.includes('Pilot_Secret_Key_9988')
);

// 9. Clipboard Read
await test(
  'Clipboard Get',
  'read clipboard',
  (r) => r.success && r.summary.includes('Pilot_Secret_Key_9988')
);

// 10. Window Switch
await test(
  'Window Switch',
  'switch to code',
  (r) => r.success && r.summary.includes('code')
);

// 11. Safe Terminal Sandbox
await test(
  'Terminal Sandbox',
  'run command git status',
  (r) => r.success && (r.summary.includes('branch') || r.summary.includes('Command:') || r.summary.includes('On branch'))
);

// 12. Knowledge Memory: Save
await test(
  'Knowledge Memory',
  'remember that my favorite editor is VS Code',
  (r) => r.success && r.summary.toLowerCase().includes('vs code')
);

// 13. Knowledge Memory: Recall
await test(
  'Knowledge Recall',
  'what is my favorite editor?',
  (r) => r.success && r.summary.toLowerCase().includes('vs code')
);

// 14. Continuous Input History
await test(
  'Input History',
  'show my input history',
  (r) => r.success && (r.summary.includes('recent inputs') || r.summary.includes('1.'))
);

// 15. Filesystem Pattern Search
await test(
  'File Search',
  'find files named *.js in src',
  (r) => r.success && (r.summary.includes('workflowEngine.js') || r.summary.includes('systemInspector.js'))
);

// 16. Master Volume Control
await test(
  'Volume Control',
  'set volume to 36%',
  (r) => r.success && r.summary.includes('36%')
);

// 17. Volume Status & Media Session
await test(
  'Volume Status',
  'what is the volume',
  (r) => r.success && (r.summary.includes('Master volume') || r.summary.includes('36%'))
);

// 18. Native Laptop App Launch
await test(
  'App Launch',
  'open calculator',
  (r) => r.success && r.summary.includes('calculator')
);

// 19. Contextual App Termination
await test(
  'Contextual Close',
  'close it',
  (r) => r.success && r.summary.includes('Closed')
);

// 20. Universal Website Opener
await test(
  'Universal Website',
  'open gemini',
  (r) => r.success && r.summary.includes('gemini')
);

console.log('\n====================================================');
console.log(`📊 COMPLETE MASTER RESULTS: ${passed} / ${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
console.log('====================================================\n');

// Clean test artifacts
await fs.unlink('test_inventory.csv').catch(() => {});
await fs.unlink('test_app_settings.json').catch(() => {});
await fs.unlink('sprint_plan.txt').catch(() => {});

if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
