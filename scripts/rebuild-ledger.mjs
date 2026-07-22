/**
 * Rebuild the accounting ledger from the operational records.
 *
 *   npm run rebuild-ledger
 *
 * Every posting rule is a pure function of one source document, so throwing
 * the ledger away and replaying it produces exactly the same result. Use this
 * if a posting ever failed, after fixing a bug in a posting rule, or simply
 * to prove to yourself that the books reconcile to the transactions.
 *
 * Manual journal entries typed in by the owner are preserved.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(file) {
  const path = resolve(root, file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!m) continue;
    let v = (m[2] || '').trim();
    if (/^["'].*["']$/.test(v)) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv('.env.local');
loadEnv('.env');

if (!process.env.MONGODB_URI) {
  console.error('\n  MONGODB_URI is not set. Check .env.local.\n');
  process.exit(1);
}

const { rebuildLedger, trialBalance } = await import('../lib/accounting/statements.js');

console.log('Connecting…');
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
console.log('Connected.\n');

const result = await rebuildLedger({ onProgress: (m) => console.log('  ' + m) });

console.log('\nTrial balance:');
const tb = await trialBalance();
for (const row of tb.rows) {
  console.log(
    `  ${row.code}  ${row.name.padEnd(30)} Dr ${String(row.debit).padStart(12)}   Cr ${String(row.credit).padStart(12)}`
  );
}
console.log(`  ${''.padEnd(36)} ${String(tb.totalDebit).padStart(15)}   ${String(tb.totalCredit).padStart(15)}`);

if (tb.balanced) {
  console.log('\n  ✓ The books balance.\n');
} else {
  console.log(`\n  ✗ OUT OF BALANCE BY ${tb.difference}. Something is wrong — do not trust these figures.\n`);
}

await mongoose.disconnect();
process.exit(tb.balanced ? 0 : 1);
