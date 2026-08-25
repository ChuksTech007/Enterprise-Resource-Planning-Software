/**
 * Empty the shop's records, keeping the people who can sign in.
 *
 *   npm run wipe              show what would go, change nothing
 *   npm run wipe -- --yes     actually do it
 *   npm run wipe -- --yes --users   take the logins too, leaving nothing
 *
 * For handing over a clean system: the demo prices, the test jobs and the
 * figures somebody typed while learning the screens should not become the
 * shop's opening books. Accounts, counters and settings go with them, so
 * invoice numbering starts at one and the ledger opens empty.
 *
 * Deliberately does nothing without --yes, and prints the database name
 * first. The commonest way to lose a shop's records is running the right
 * command against the wrong database, and a name on screen is the last
 * chance anybody gets to notice.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(file) {
  const path = resolve(root, file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!m) continue;
    let v = (m[2] || '').trim();
    if (/^["'].*["']$/.test(v)) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv('.env.local');
loadEnv('.env');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('\n  MONGODB_URI is not set. Check .env.local.\n');
  process.exit(1);
}

const go = process.argv.includes('--yes');
const alsoUsers = process.argv.includes('--users');

/* Logins are kept unless asked otherwise. A shop with no records is a shop
 * starting fresh; a shop with no logins is one nobody can get into. */
const KEEP = alsoUsers ? [] : ['users'];

console.log('\n  Connecting…');
await mongoose.connect(uri, { serverSelectionTimeoutMS: 60000 });

const db = mongoose.connection.db;
console.log('  Database: ' + mongoose.connection.name);
console.log('  Host:     ' + mongoose.connection.host);
console.log('');

const collections = await db.listCollections().toArray();
const plan = [];

for (const c of collections) {
  const count = await db.collection(c.name).countDocuments();
  if (count === 0) continue;
  plan.push({ name: c.name, count, keep: KEEP.includes(c.name) });
}

if (plan.length === 0) {
  console.log('  Already empty. Nothing to do.\n');
  await mongoose.disconnect();
  process.exit(0);
}

const going = plan.filter((p) => !p.keep);
const staying = plan.filter((p) => p.keep);

console.log('  WILL BE ERASED:');
for (const p of going) console.log('    ' + String(p.count).padStart(5) + '  ' + p.name);

if (staying.length) {
  console.log('');
  console.log('  KEPT:');
  for (const p of staying) console.log('    ' + String(p.count).padStart(5) + '  ' + p.name);
}

const total = going.reduce((s, p) => s + p.count, 0);

if (!go) {
  console.log('');
  console.log(`  ${total} record(s) would be erased. Nothing has been changed.`);
  console.log('  To go ahead:  npm run wipe -- --yes\n');
  await mongoose.disconnect();
  process.exit(0);
}

console.log('');
console.log('  Erasing…');
for (const p of going) {
  await db.collection(p.name).deleteMany({});
}

console.log(`  ✓ ${total} record(s) erased from ${mongoose.connection.name}.`);

if (!alsoUsers) {
  const left = await db.collection('users').countDocuments();
  console.log(`  ${left} login(s) kept — you can still sign in.`);
}

console.log('');
console.log('  The shop now opens empty: no prices, no stock, no jobs, and');
console.log('  invoice numbering starts again at one. Enter the real prices');
console.log('  under Price list before trading.\n');

await mongoose.disconnect();
process.exit(0);
