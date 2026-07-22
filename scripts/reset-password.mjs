/**
 * Emergency password reset — the way back in when nobody can sign in.
 *
 *   npm run reset-password -- <username> <new-password>
 *   npm run reset-password -- --list
 *
 * Normally the owner resets a cashier's password under Staff. But if the
 * OWNER forgets theirs, there is nobody left with the authority to fix it, and
 * the business is locked out of its own records. This script is that way back.
 *
 * It needs the database connection string, so only someone with server access
 * can run it. It also clears any lockout from failed sign-in attempts.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(file) {
  const path = resolve(root, file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;
    let value = (match[2] || '').trim();
    if (/^["'].*["']$/.test(value)) value = value.slice(1, -1);
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}

loadEnv('.env.local');
loadEnv('.env');

if (!process.env.MONGODB_URI) {
  console.error('\n  MONGODB_URI is not set. Check .env.local.\n');
  process.exit(1);
}

const { User } = await import('../lib/models.js');

const args = process.argv.slice(2);
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });

if (args[0] === '--list' || args.length === 0) {
  const users = await User.find({}).select('name username role active lockUntil').sort({ role: 1, name: 1 }).lean();

  if (!users.length) {
    console.log('\n  No accounts exist yet. Run `npm run seed` first.\n');
  } else {
    console.log('\n  Accounts:\n');
    for (const u of users) {
      const locked = u.lockUntil && u.lockUntil > new Date() ? '  [LOCKED]' : '';
      const disabled = u.active ? '' : '  [disabled]';
      console.log(`    ${u.username.padEnd(16)} ${u.role.padEnd(8)} ${u.name}${disabled}${locked}`);
    }
    console.log('\n  To reset one:\n');
    console.log('    npm run reset-password -- <username> <new-password>\n');
  }
  await mongoose.disconnect();
  process.exit(0);
}

const [username, password] = args;

if (!password) {
  console.error('\n  Usage: npm run reset-password -- <username> <new-password>\n');
  await mongoose.disconnect();
  process.exit(1);
}

if (password.length < 6) {
  console.error('\n  Password must be at least 6 characters.\n');
  await mongoose.disconnect();
  process.exit(1);
}

const user = await User.findOne({ username: String(username).toLowerCase().trim() });

if (!user) {
  console.error(`\n  No account with username "${username}". Run with --list to see them.\n`);
  await mongoose.disconnect();
  process.exit(1);
}

user.passwordHash = await bcrypt.hash(password, 10);
user.failedLoginCount = 0;
user.lockUntil = undefined;
// A reset is useless if the account is still switched off.
if (!user.active) {
  user.active = true;
  console.log('\n  Note: this account was disabled. It has been re-enabled.');
}
await user.save();

console.log(`\n  Password reset for ${user.name} (${user.username}, ${user.role}).`);
console.log('  Sign in with the new password, then change it under Staff.\n');

await mongoose.disconnect();
process.exit(0);
