/**
 * First-run setup.
 *
 *   npm run seed
 *
 * Creates the owner account, the business settings, and a starter price list
 * and stock list so the app is usable the moment it opens rather than being a
 * wall of empty screens.
 *
 * Safe to run more than once — it only fills in what is missing.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/* Load .env.local without pulling in a dependency. */
function loadEnv(file) {
  const path = resolve(root, file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = (match[2] || '').trim();
    if (/^["'].*["']$/.test(value)) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv('.env.local');
loadEnv('.env');

const { User, Settings, PriceItem, Material, Supplier, StockMovement } = await import('../lib/models.js');

if (!process.env.MONGODB_URI) {
  console.error('\n  MONGODB_URI is not set.');
  console.error('  Copy .env.example to .env.local and paste your MongoDB Atlas connection string.\n');
  process.exit(1);
}

console.log('Connecting to MongoDB…');
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
console.log('Connected.\n');

/* ------------------------------ owner ------------------------------ */

const username = (process.env.SEED_OWNER_USERNAME || 'owner').toLowerCase();
const password = process.env.SEED_OWNER_PASSWORD || 'changeme123';

let owner = await User.findOne({ username });
if (owner) {
  console.log(`✓ Owner account "${username}" already exists — left alone.`);
} else {
  owner = await User.create({
    name: process.env.SEED_OWNER_NAME || 'Shop Owner',
    username,
    passwordHash: await bcrypt.hash(password, 10),
    role: 'owner',
  });
  console.log(`✓ Created owner account`);
  console.log(`    username: ${username}`);
  console.log(`    password: ${password}`);
  console.log(`    ^ change this password after you sign in.`);
}

/* ----------------------------- settings ---------------------------- */

const settings = await Settings.findOne({ key: 'main' });
if (!settings) {
  await Settings.create({ key: 'main', businessName: 'My Printing Press', currency: '₦' });
  console.log('✓ Created default business settings');
} else {
  console.log('✓ Settings already exist');
}

/* ---------------------------- price list --------------------------- */

const PRICES = [
  { name: '100 complimentary cards', jobType: 'Business cards', unitLabel: 'per 100', price: 8000, estimatedCost: 3200, minQuantity: 1 },
  { name: '1000 complimentary cards', jobType: 'Business cards', unitLabel: 'per 1000', price: 45000, estimatedCost: 21000, minQuantity: 1 },
  { name: 'A5 flyers (per 100)', jobType: 'Flyers', unitLabel: 'per 100', price: 12000, estimatedCost: 5500, minQuantity: 1 },
  { name: 'Banner 3x2ft', jobType: 'Banner', unitLabel: 'per piece', price: 9000, estimatedCost: 4000, minQuantity: 1 },
  { name: 'Banner (per sqm)', jobType: 'Large format', unitLabel: 'per sqm', price: 4500, estimatedCost: 2000, minQuantity: 1 },
  { name: 'Stickers A4 sheet', jobType: 'Stickers', unitLabel: 'per sheet', price: 1500, estimatedCost: 600, minQuantity: 5 },
  { name: 'Booklet binding', jobType: 'Booklet', unitLabel: 'per copy', price: 2500, estimatedCost: 1100, minQuantity: 1 },
  { name: 'A4 lamination', jobType: 'Finishing only', unitLabel: 'per sheet', price: 500, estimatedCost: 150, minQuantity: 1 },
  { name: 'Photocopy A4 (per page)', jobType: 'Other', unitLabel: 'per page', price: 50, estimatedCost: 15, minQuantity: 10 },
];

const priceCount = await PriceItem.countDocuments();
if (priceCount === 0) {
  await PriceItem.insertMany(PRICES);
  console.log(`✓ Added ${PRICES.length} starter prices — edit them to match your real rates`);
} else {
  console.log(`✓ Price list already has ${priceCount} item(s)`);
}

/* ------------------------- suppliers & stock ------------------------ */

const materialCount = await Material.countDocuments();
if (materialCount === 0) {
  const supplier = await Supplier.create({
    name: 'Example Paper Supplier',
    phone: '08000000000',
    leadTimeDays: 4,
    notes: 'Replace this with your real supplier.',
  });

  const MATERIALS = [
    { name: 'Art paper 300gsm', category: 'Paper', size: 'SRA3', gsm: 300, finish: 'Matte', colour: 'White', unit: 'sheets', quantity: 500, reorderLevel: 100, unitCost: 120, shelfLocation: 'A1' },
    { name: 'Art paper 150gsm', category: 'Paper', size: 'A3', gsm: 150, finish: 'Gloss', colour: 'White', unit: 'sheets', quantity: 800, reorderLevel: 200, unitCost: 70, shelfLocation: 'A2' },
    { name: 'Bond paper 80gsm', category: 'Paper', size: 'A4', gsm: 80, colour: 'White', unit: 'reams', quantity: 12, reorderLevel: 4, unitCost: 7500, shelfLocation: 'B1' },
    { name: 'Flex banner material', category: 'Substrate', size: '1370mm roll', unit: 'metres', quantity: 60, reorderLevel: 15, unitCost: 1800, shelfLocation: 'Store' },
    { name: 'Vinyl sticker roll', category: 'Substrate', size: '1070mm roll', unit: 'metres', quantity: 40, reorderLevel: 10, unitCost: 2200, shelfLocation: 'Store' },
    { name: 'Gloss lamination film', category: 'Lamination film', size: '330mm', unit: 'rolls', quantity: 6, reorderLevel: 2, unitCost: 9500, shelfLocation: 'C1' },
    { name: 'Toner — Black', category: 'Toner', colour: 'Black', unit: 'pieces', quantity: 3, reorderLevel: 1, unitCost: 42000, shelfLocation: 'C2' },
    { name: 'Toner — Cyan', category: 'Toner', colour: 'Cyan', unit: 'pieces', quantity: 2, reorderLevel: 1, unitCost: 45000, shelfLocation: 'C2' },
    { name: 'Toner — Magenta', category: 'Toner', colour: 'Magenta', unit: 'pieces', quantity: 2, reorderLevel: 1, unitCost: 45000, shelfLocation: 'C2' },
    { name: 'Toner — Yellow', category: 'Toner', colour: 'Yellow', unit: 'pieces', quantity: 1, reorderLevel: 1, unitCost: 45000, shelfLocation: 'C2' },
    { name: 'Binding coils 12mm', category: 'Binding', unit: 'packs', quantity: 5, reorderLevel: 2, unitCost: 6000, shelfLocation: 'D1' },
    { name: 'Cutting blades', category: 'Blades', unit: 'pieces', quantity: 8, reorderLevel: 3, unitCost: 2500, shelfLocation: 'D2' },
  ];

  for (const m of MATERIALS) {
    const { quantity, ...rest } = m;
    const material = await Material.create({ ...rest, supplier: supplier._id, quantity });
    // Record the opening balance as a real movement so the log reconciles.
    await StockMovement.create({
      material: material._id,
      materialName: material.name,
      type: 'in',
      quantity,
      delta: quantity,
      unit: material.unit,
      unitCost: material.unitCost,
      balanceAfter: quantity,
      reason: 'Opening stock (seed)',
      user: owner._id,
      userName: owner.name,
    });
  }

  console.log(`✓ Added ${MATERIALS.length} sample stock items and 1 supplier`);
  console.log('    Note: "Toner — Yellow" is deliberately at its reorder level so you can see the low-stock alert.');
} else {
  console.log(`✓ Stock already has ${materialCount} item(s)`);
}

console.log('\nDone. Start the app with:  npm run dev');
console.log('Then open http://localhost:3000 and sign in.\n');

await mongoose.disconnect();
process.exit(0);
