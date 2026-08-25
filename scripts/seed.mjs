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

/* A starter rate card, in the shape the shop's paper invoice already uses:
 * a size, and what each thing costs at that size.
 *
 * THE FIGURES ARE PLACEHOLDERS. They were taken from an example invoice and
 * are not the shop's real prices — the owner edits every one of them before
 * trading. They exist so the screens have something to show on the first day,
 * and so the shape of the card is obvious.
 *
 * Sizes are written the way the counter writes them, in inches: "12/15".
 */
const SIZES = ['8/10', '10/12', '12/15', '16/20', '20/24', '24/36'];

const PRICES = SIZES.flatMap((size, i) => {
  /* Bigger costs more. A crude ramp purely so the placeholder card is not
   * flat — the owner replaces these. */
  const step = i + 1;
  return [
    { name: `Print ${size}`, product: 'print', size, unitLabel: 'per piece', price: 500 * step, estimatedCost: 200 * step },
    { name: `Canvas ${size}`, product: 'canvas', size, unitLabel: 'per piece', price: 400 * step, estimatedCost: 150 * step },
    { name: `Frame ${size} bold`, product: 'frame', size, grade: 'bold', unitLabel: 'per piece', price: 2500 * step, estimatedCost: 1200 * step },
    { name: `Frame ${size} normal`, product: 'frame', size, grade: 'normal', unitLabel: 'per piece', price: 1800 * step, estimatedCost: 900 * step },
    { name: `Frame ${size} tiny`, product: 'frame', size, grade: 'tiny', unitLabel: 'per piece', price: 1200 * step, estimatedCost: 600 * step },
    { name: `Acrylic glass ${size}`, product: 'glass', size, unitLabel: 'per piece', price: 900 * step, estimatedCost: 450 * step },
    { name: `Frameless board ${size}`, product: 'board', size, unitLabel: 'per piece', price: 1500 * step, estimatedCost: 700 * step },
  ];
});

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
    // Moulding is bought in lengths and consumed by the millimetre.
    { name: 'Oak 40mm', category: 'Moulding', size: '3m length', colour: 'Natural', unit: 'lengths', quantity: 18, reorderLevel: 6, unitCost: 4800, shelfLocation: 'Rack A' },
    { name: 'Black gloss 25mm', category: 'Moulding', size: '3m length', colour: 'Black', unit: 'lengths', quantity: 24, reorderLevel: 8, unitCost: 3000, shelfLocation: 'Rack A' },
    { name: 'Gold ornate 75mm', category: 'Moulding', size: '3m length', colour: 'Gold', unit: 'lengths', quantity: 6, reorderLevel: 4, unitCost: 14000, shelfLocation: 'Rack B' },

    // Glazing and board come in sheets and are cut to the mounted size.
    { name: 'Clear glass 2mm', category: 'Glazing', size: '1220 x 915 mm', unit: 'sheets', quantity: 14, reorderLevel: 5, unitCost: 4200, shelfLocation: 'Glass bay' },
    { name: 'Non-reflective glass', category: 'Glazing', size: '1220 x 915 mm', unit: 'sheets', quantity: 4, reorderLevel: 2, unitCost: 11500, shelfLocation: 'Glass bay' },
    { name: 'Acrylic 2mm', category: 'Glazing', size: '1220 x 915 mm', unit: 'sheets', quantity: 7, reorderLevel: 3, unitCost: 8500, shelfLocation: 'Glass bay' },
    { name: 'Mount board white core', category: 'Mount board', size: '1220 x 810 mm', colour: 'White', unit: 'sheets', quantity: 30, reorderLevel: 10, unitCost: 2800, shelfLocation: 'C1' },
    { name: 'Mount board cream', category: 'Mount board', size: '1220 x 810 mm', colour: 'Cream', unit: 'sheets', quantity: 12, reorderLevel: 6, unitCost: 2800, shelfLocation: 'C1' },
    { name: 'MDF backing 3mm', category: 'Backing board', size: '1220 x 915 mm', unit: 'sheets', quantity: 20, reorderLevel: 8, unitCost: 1900, shelfLocation: 'C2' },

    // The small things that stop a job going out of the door.
    { name: 'D-rings and cord', category: 'Fittings', unit: 'packs', quantity: 9, reorderLevel: 3, unitCost: 2500, shelfLocation: 'D1' },
    { name: 'V-nails 12mm', category: 'Fittings', unit: 'packs', quantity: 5, reorderLevel: 2, unitCost: 6000, shelfLocation: 'D1' },
    { name: 'Framers tape', category: 'Adhesive', unit: 'rolls', quantity: 2, reorderLevel: 2, unitCost: 3500, shelfLocation: 'D2' },
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
  console.log('    Note: "Framers tape" is deliberately at its reorder level so you can see the low-stock alert.');
} else {
  console.log(`✓ Stock already has ${materialCount} item(s)`);
}

console.log('\nDone. Start the app with:  npm run dev');
console.log('Then open http://localhost:3000 and sign in.\n');

await mongoose.disconnect();
process.exit(0);
