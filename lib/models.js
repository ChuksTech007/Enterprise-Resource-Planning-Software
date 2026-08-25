import mongoose from 'mongoose';
import { PRICING_MODES } from './pricing.js';

const { Schema } = mongoose;
const opts = { timestamps: true };
const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name });

/* ------------------------------------------------------------------ *
 * Shared vocabularies. Kept here so the UI dropdowns and the database
 * can never drift apart — every <select> imports from this file.
 * ------------------------------------------------------------------ */

export const ROLES = ['owner', 'cashier'];

/* What sits on a framer's shelves. Moulding is bought by the length,
 * glazing and boards by the sheet, fittings by the packet — the unit each is
 * counted in is what the stock screen has to speak. */
export const MATERIAL_CATEGORIES = [
  'Moulding',
  'Glazing',
  'Mount board',
  'Backing board',
  'Fittings',
  'Adhesive',
  'Consumables',
  'Other',
];
/* Which part of a framed piece a price row supplies.
 *
 * These are the keys lib/pricing.js expects when it assembles a quote, so the
 * price list and the maths cannot drift apart: a row marked 'moulding' is
 * charged by length with mitres added, a row marked 'glazing' by area of the
 * mounted glass. 'none' is for things sold whole — a ready-made frame, a
 * repair, a delivery — which never enter the size calculation.
 */
export const PRICE_PARTS = ['moulding', 'glazing', 'mountBoard', 'backing', 'labour', 'none'];

/* What the shop sells. Three things go on one line of an invoice, and a
 * customer usually buys more than one of them for the same picture: the
 * print, the canvas it is mounted on, and the frame around it. Each is
 * priced separately and any of them can be left off — a print handed over
 * in a bag has no canvas and no frame.
 */
export const PRODUCTS = ['print', 'canvas', 'frame', 'glass', 'board', 'other'];

export const PRODUCT_LABELS = {
  print: 'Print',
  canvas: 'Canvas',
  frame: 'Frame',
  glass: 'Acrylic glass',
  board: 'Frameless board',
  other: 'Other',
};

/* Frames come in grades rather than mouldings measured by the metre. The
 * shop quotes "12/15 bold" and knows what that costs; it does not work out
 * a perimeter. Only frames carry a grade. */
export const FRAME_GRADES = ['bold', 'normal', 'tiny'];


export const PRICE_PART_LABELS = {
  moulding: 'Moulding',
  glazing: 'Glass / acrylic',
  mountBoard: 'Mount board',
  backing: 'Backing',
  labour: 'Labour',
  none: 'Sold on its own',
};

/* What each rate means, in words the counter can read on a form. */
export const PRICING_MODE_LABELS = {
  per_piece: 'per piece',
  per_m: 'per metre',
  per_sqm: 'per square metre',
  per_aperture: 'per aperture',
};


export const UNITS = ['lengths', 'metres', 'sheets', 'sqm', 'pieces', 'packs', 'rolls', 'litres'];

/* What the shop is asked to make. A framer's day is mostly custom work
 * measured on the counter, but ready-made sizes, canvas stretching, repairs
 * and mirror work are all sold too — and each is priced a different way. */
export const JOB_TYPES = [
  'Custom frame',
  'Ready-made frame',
  'Mount only',
  'Canvas stretch',
  'Glass only',
  'Reframe / repair',
  'Mirror',
  'Certificate / plaque',
  'Other',
];

export const FINISHES = ['None', 'Matte lamination', 'Gloss lamination', 'UV', 'Spot UV', 'Foiling', 'Die-cut', 'Perforation', 'Creasing', 'Binding', 'Stapling'];

// Ordered — the UI walks the job forward through this list.
export const JOB_STATUSES = ['quote', 'approved', 'printing', 'finishing', 'done', 'delivered'];
export const JOB_STATUS_ALL = [...JOB_STATUSES, 'cancelled'];
export const COLLECTION_STATUSES = ['not_ready', 'ready', 'collected'];

export const PAYMENT_METHODS = ['cash', 'transfer', 'pos', 'online'];
export const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  transfer: 'Bank transfer',
  pos: 'POS / Card',
  online: 'Online (Paystack)',
};

// Running costs. Materials are tracked separately as stock, so these are
// everything else it takes to keep the doors open — and in Nigeria the first
// entry is nearly always diesel.
export const EXPENSE_CATEGORIES = [
  'Diesel / Fuel',
  'Electricity',
  'Rent',
  'Salaries & wages',
  'Transport & delivery',
  'Machine maintenance',
  'Consumables (non-stock)',
  'Internet & airtime',
  'Bank charges',
  'Marketing',
  'Other',
];

export const MOVEMENT_TYPES = ['in', 'used', 'wastage', 'damage', 'adjustment', 'return'];
export const MOVEMENT_LABELS = {
  in: 'Stock in',
  used: 'Used on job',
  wastage: 'Wastage / misprint',
  damage: 'Damage',
  adjustment: 'Stock count adjustment',
  return: 'Returned to stock',
};
// Movement types that reduce stock.
export const OUTWARD_MOVEMENTS = ['used', 'wastage', 'damage'];

/* ------------------------------------------------------------------ */

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, default: 'cashier', index: true },
    phone: { type: String, trim: true },
    active: { type: Boolean, default: true },
    lastLoginAt: Date,
    // Brute-force protection. Counted per account rather than per IP, because
    // a shop on mobile data shares one address between every staff phone.
    failedLoginCount: { type: Number, default: 0 },
    lockUntil: Date,
  },
  opts
);

const CustomerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    phone: { type: String, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    company: { type: String, trim: true },
    notes: String,
    // Denormalised running totals — kept fresh by lib/rollups.js so the
    // customer list and debtor list stay fast without aggregating on read.
    jobCount: { type: Number, default: 0 },
    totalBilled: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    outstanding: { type: Number, default: 0, index: true },
    lastJobAt: Date,
    createdBy: ref('User'),
  },
  opts
);
CustomerSchema.virtual('isRepeat').get(function () {
  return this.jobCount >= 2;
});
CustomerSchema.set('toJSON', { virtuals: true });

const SupplierSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    address: String,
    // Days between placing an order and stock arriving. Drives the
    // "reorder now" warning on the inventory page.
    leadTimeDays: { type: Number, default: 3, min: 0 },
    notes: String,
    active: { type: Boolean, default: true },
  },
  opts
);

const MaterialSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    category: { type: String, enum: MATERIAL_CATEGORIES, default: 'Paper', index: true },
    size: { type: String, trim: true }, // e.g. A4, SRA3, 13x19, 1370mm roll
    gsm: { type: Number },
    finish: { type: String, trim: true }, // Gloss, Matte, Uncoated...
    colour: { type: String, trim: true }, // White, Cream, Cyan, Magenta...
    supplier: ref('Supplier'),
    unit: { type: String, enum: UNITS, default: 'sheets' },
    quantity: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 0 },
    unitCost: { type: Number, default: 0 }, // cost price per `unit` — owner-only
    shelfLocation: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  opts
);
MaterialSchema.index({ name: 'text', size: 'text', colour: 'text' });

const StockMovementSchema = new Schema(
  {
    material: { ...ref('Material'), required: true, index: true },
    materialName: String, // snapshot, so the log stays readable if a material is renamed
    type: { type: String, enum: MOVEMENT_TYPES, required: true, index: true },
    quantity: { type: Number, required: true, min: 0 }, // always positive; `type` gives direction
    delta: { type: Number, default: 0 }, // signed change actually applied to stock
    unit: String,
    unitCost: { type: Number, default: 0 }, // cost at the time of the movement
    balanceAfter: Number,
    reason: String,
    job: ref('Job'),
    jobNumber: String,
    // Set when the stock arrived against a purchase order. The ledger skips
    // these, because the purchase order posts Inventory/Payables itself —
    // otherwise the delivery would be recorded twice.
    purchaseOrder: ref('PurchaseOrder'),
    user: ref('User'),
    userName: String,
  },
  opts
);
StockMovementSchema.index({ createdAt: -1 });

/* ------------------------------------------------------------------ *
 * The price list.
 *
 * In a print shop this was a lookup: a name and a price, tapped at the
 * counter. A framing shop cannot work that way — the same moulding is a
 * different amount of money on every job, because the job has a size.
 *
 * So a row here is a RATE, not a price, and it carries two things the maths
 * needs: which part of a framed piece it is, and how its rate should be read.
 * Without  a rate is just a number, and 4,500 could mean per metre,
 * per square metre or per piece — three quotes that differ by an order of
 * magnitude.
 * ------------------------------------------------------------------ */
const PriceItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },

    /* ---- the rate card the counter actually works from ----
     *
     * The shop quotes by SIZE. "12/15" costs what it costs: so much to
     * print, so much for canvas, so much for a bold frame. That is a
     * lookup, not a calculation, and it is how the paper invoice this
     * replaces has always worked.
     *
     * One row is therefore one cell of that card — a product, at a size,
     * in a grade. Leaving `size` blank means the rate holds whatever the
     * size, which is how things sold by the piece are handled.
     */
    product: { type: String, enum: PRODUCTS, default: 'other', index: true },

    /* As the shop writes it — "12/15", "16/20". Kept as typed rather than
     * parsed into numbers, because it is a label on a rate card and has to
     * read back exactly as the staff know it. */
    size: { type: String, trim: true, index: true },

    /* Frames only. bold / normal / tiny. */
    grade: { type: String, enum: [...FRAME_GRADES, null], default: null },


    /* Which part of a framed piece this is. 'none' covers rows that are sold
     * on their own — a ready-made frame, a repair — and are not assembled
     * into a priced-by-size job. */
    part: { type: String, enum: PRICE_PARTS, default: 'none', index: true },

    /* How to read the price. The engine in lib/pricing.js multiplies it by
     * length, by area, or not at all, depending on this. */
    mode: { type: String, enum: PRICING_MODES, default: 'per_piece' },

    jobType: { type: String, enum: JOB_TYPES, default: 'Other', index: true },
    description: String,
    unitLabel: { type: String, default: 'per piece' },

    price: { type: Number, required: true, min: 0 },
    estimatedCost: { type: Number, default: 0 }, // owner-only; feeds the margin

    /* Moulding only. The face width decides how much extra the four mitres
     * eat (8 x this), and the wastage is the offcut that will not serve the
     * next job. Both are why a frame needs more moulding than its perimeter. */
    mouldingWidthMm: { type: Number, default: 0, min: 0 },
    wastageMm: { type: Number, default: 0, min: 0 },

    /* Mount board only. Cutting a window is skilled work charged per opening,
     * so a triple mount is three times this on a single board. */
    cuttingPrice: { type: Number, default: 0, min: 0 },

    minQuantity: { type: Number, default: 1 },
    active: { type: Boolean, default: true },
  },
  opts
);

const JobMaterialSchema = new Schema(
  {
    material: ref('Material'),
    name: String,
    quantity: { type: Number, default: 0 },
    unit: String,
    unitCost: { type: Number, default: 0 },
  },
  { _id: false }
);

/**
 * One product on an order.
 *
 * A real order is often "500 flyers + 100 cards + 1 banner" for one customer,
 * one deadline, one invoice — so a job holds a list of these rather than a
 * single job type and price.
 */
/* How a price was arrived at, frozen at the moment it was given.
 *
 * Not a convenience — the whole reason a framing quote can be defended. The
 * price of moulding moves; recomputing an August quote from October's rates
 * silently rewrites what the customer was told and turns a disagreement into
 * one the shop loses. So the lines are copied onto the job and never touched
 * again.
 *
 * It is also what lets anyone read a job ticket and see WHY a small picture
 * cost what it did — usually the glass, once a wide mount grew it.
 */
const PriceLineSchema = new Schema(
  {
    part: String,
    name: String,
    detail: String,
    amount: { type: Number, default: 0 },
  },
  { _id: false }
);

const JobItemSchema = new Schema(
  {
    jobType: { type: String, enum: JOB_TYPES, default: 'Other' },
    description: { type: String, trim: true },
    quantity: { type: Number, default: 1, min: 0 },
    /* What was measured, and what it grew to.
     *
     * Kept on the job rather than recomputed, because the workshop cuts to
     * these numbers and the customer is charged on them. `size` is what the
     * counter typed; the millimetre figures are what that was understood to
     * mean, which is the pair worth having when somebody queries a job three
     * weeks later.
     */
    specs: {
      size: String,
      artworkWidthMm: Number,
      artworkHeightMm: Number,
      glassWidthMm: Number,
      glassHeightMm: Number,
      mountBorderMm: Number,
      mountApertures: Number,
      moulding: String,
      glazing: String,
      mountBoard: String,
      backing: String,
      notes: String,
    },
    unitPrice: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

const JobSchema = new Schema(
  {
    jobNumber: { type: String, unique: true, index: true },
    // What is being printed. Always populated, even for a one-product order.
    items: [JobItemSchema],
    customer: { ...ref('Customer'), index: true },
    customerName: String, // snapshot for fast lists
    // The following three are derived from `items` on every write. They are
    // stored rather than computed so job lists, filters and the reporting
    // indexes stay fast and simple.
    jobType: { type: String, enum: JOB_TYPES, default: 'Other', index: true }, // the first item's type
    description: String, // a one-line summary of the whole order
    quantity: { type: Number, default: 1, min: 0 }, // total pieces across items
    /* What was measured, and what it grew to.
     *
     * Kept on the job rather than recomputed, because the workshop cuts to
     * these numbers and the customer is charged on them. `size` is what the
     * counter typed; the millimetre figures are what that was understood to
     * mean, which is the pair worth having when somebody queries a job three
     * weeks later.
     */
    specs: {
      size: String,
      artworkWidthMm: Number,
      artworkHeightMm: Number,
      glassWidthMm: Number,
      glassHeightMm: Number,
      mountBorderMm: Number,
      mountApertures: Number,
      moulding: String,
      glazing: String,
      mountBoard: String,
      backing: String,
      notes: String,
    },
    priceBreakdown: [PriceLineSchema],
    materials: [JobMaterialSchema],
    assignedTo: ref('User'),
    assignedToName: String,
    status: { type: String, enum: JOB_STATUS_ALL, default: 'quote', index: true },
    collectionStatus: { type: String, enum: COLLECTION_STATUSES, default: 'not_ready', index: true },
    isRush: { type: Boolean, default: false, index: true },
    unitPrice: { type: Number, default: 0 },
    price: { type: Number, default: 0 }, // total charged for the job
    discount: { type: Number, default: 0 },
    deadline: { type: Date, index: true },
    notes: String,
    // Set once, when the job first reaches "done", so a job can never
    // deduct the same materials from stock twice.
    stockDeducted: { type: Boolean, default: false },
    stockDeductedAt: Date,
    sale: ref('Sale'), // the invoice raised for this job
    collectedBy: String,
    collectedAt: Date,
    deliveredAt: Date,
    cancelledAt: Date,
    cancelReason: String,
    // Client-generated id, sent by the offline queue. See clientRef below.
    clientRef: { type: String },
    createdBy: ref('User'),
    createdByName: String,
    statusHistory: [
      {
        status: String,
        at: Date,
        by: String,
        _id: false,
      },
    ],
  },
  opts
);
JobSchema.index({ createdAt: -1 });
JobSchema.virtual('total').get(function () {
  return Math.max(0, (this.price || 0) - (this.discount || 0));
});
JobSchema.set('toJSON', { virtuals: true });

const SaleItemSchema = new Schema(
  {
    description: { type: String, required: true },
    jobType: String,
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    unitCost: { type: Number, default: 0 }, // owner-only; feeds profit
  },
  { _id: false }
);

const SaleSchema = new Schema(
  {
    invoiceNumber: { type: String, unique: true, index: true },
    type: { type: String, enum: ['walkin', 'job'], default: 'walkin', index: true },
    job: { ...ref('Job'), index: true },
    jobNumber: String,
    customer: { ...ref('Customer'), index: true },
    customerName: { type: String, default: 'Walk-in customer' },
    customerPhone: String,
    items: [SaleItemSchema],
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    balance: { type: Number, default: 0, index: true },
    // Cost of materials/consumables attributed to this sale. Owner-only.
    materialCost: { type: Number, default: 0 },
    status: { type: String, enum: ['unpaid', 'partial', 'paid', 'refunded'], default: 'unpaid', index: true },
    dueDate: Date,
    notes: String,
    voided: { type: Boolean, default: false, index: true },
    voidReason: String,
    voidedAt: Date,
    voidedBy: ref('User'),
    // Reminder trail for outstanding balances.
    lastReminderAt: Date,
    reminderCount: { type: Number, default: 0 },
    clientRef: { type: String },
    createdBy: ref('User'),
    createdByName: String,
  },
  opts
);
SaleSchema.index({ createdAt: -1 });

const PaymentSchema = new Schema(
  {
    sale: { ...ref('Sale'), required: true, index: true },
    invoiceNumber: String,
    job: ref('Job'),
    customer: ref('Customer'),
    customerName: String,
    amount: { type: Number, required: true }, // negative for a refund
    method: { type: String, enum: PAYMENT_METHODS, required: true, index: true },
    // Bank/POS/Paystack reference. Unique per method when present, so the
    // same online payment can never be recorded against two invoices.
    reference: { type: String, trim: true },
    isRefund: { type: Boolean, default: false },
    isDeposit: { type: Boolean, default: false },
    // What the customer physically handed over, and what went back to them.
    // The till only ever gains `amount`; these two are for the receipt and
    // for settling "I gave you five thousand" arguments later.
    tendered: { type: Number },
    changeGiven: { type: Number },
    note: String,
    // Cash payments belong to the cashier's open register session so the
    // end-of-day count has something to be measured against.
    registerSession: { ...ref('RegisterSession'), index: true },
    clientRef: { type: String },
    receivedBy: ref('User'),
    receivedByName: String,
    voided: { type: Boolean, default: false, index: true },
  },
  opts
);
PaymentSchema.index({ createdAt: -1 });
// One reference can only ever belong to one payment, so the same transfer or
// Paystack payment cannot be recorded against two invoices.
// The filter uses only $type — MongoDB does not allow $ne in a partial index
// filter. An empty reference is stored as undefined (see recordPayment), so
// $type: 'string' already excludes the blanks that cash payments leave behind.
PaymentSchema.index(
  { reference: 1 },
  { unique: true, partialFilterExpression: { reference: { $type: 'string' } } }
);

const ExpenseSchema = new Schema(
  {
    date: { type: Date, default: Date.now, index: true },
    category: { type: String, enum: EXPENSE_CATEGORIES, default: 'Other', index: true },
    description: { type: String, trim: true },
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'cash' },
    supplier: ref('Supplier'),
    // Money taken straight out of the drawer. Without this the cash-up would
    // report a shortfall every time someone buys diesel with till money.
    paidFromTill: { type: Boolean, default: false },
    registerSession: { ...ref('RegisterSession'), index: true },
    notes: String,
    clientRef: { type: String },
    // For salaries: which member of staff this paid. Lets the owner see cost
    // per person without running a full payroll module.
    staff: ref('User'),
    staffName: String,
    recordedBy: ref('User'),
    recordedByName: String,
  },
  opts
);
ExpenseSchema.index({ date: -1 });

const RegisterSessionSchema = new Schema(
  {
    user: { ...ref('User'), required: true, index: true },
    userName: String,
    openedAt: { type: Date, default: Date.now },
    openingFloat: { type: Number, default: 0 },
    closedAt: Date,
    // Snapshot taken at close so the numbers can never silently change later.
    expectedCash: { type: Number, default: 0 },
    countedCash: { type: Number, default: 0 },
    variance: { type: Number, default: 0 },
    totals: {
      cash: { type: Number, default: 0 },
      transfer: { type: Number, default: 0 },
      pos: { type: Number, default: 0 },
      online: { type: Number, default: 0 },
      refunds: { type: Number, default: 0 },
      // Petty cash paid out of the drawer during the shift.
      cashOut: { type: Number, default: 0 },
    },
    salesCount: { type: Number, default: 0 },
    notes: String,
    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
  },
  opts
);

const AuditLogSchema = new Schema(
  {
    user: ref('User'),
    userName: String,
    role: String,
    action: { type: String, required: true, index: true }, // e.g. "sale.create"
    entity: String, // "Sale"
    entityId: String,
    label: String, // human-readable summary shown in the audit page
    details: Schema.Types.Mixed,
    ip: String,
  },
  opts
);
AuditLogSchema.index({ createdAt: -1 });

const SettingsSchema = new Schema(
  {
    key: { type: String, default: 'main', unique: true },
    businessName: { type: String, default: "Master's Technology" },
    address: String,
    phone: String,
    email: String,
    currency: { type: String, default: '₦' },
    receiptFooter: { type: String, default: 'Thank you for your patronage.' },
    ownerEmail: String,
    ownerWhatsapp: String, // e.g. 2348012345678
    lowStockNagging: { type: Boolean, default: true },

    /* How the counter measures.
     *
     * A bare "24x36" written on a docket means inches in most framing shops
     * and millimetres in some. Guessing from the magnitude would be clever
     * and wrong — 24x36mm is a small but real size — so the shop states it
     * once here and every size typed afterwards is read that way. */
    sizeUnit: { type: String, enum: ['in', 'mm'], default: 'in' },

    /* The least the shop will take for one piece, whatever the sum says.
     *
     * Below a certain size the materials cost almost nothing but the work is
     * the same: still a cut, a join, a clean and a wrap. Without a floor the
     * formula quotes a few hundred naira for a job that takes half an hour. */
    minimumCharge: { type: Number, default: 0, min: 0 },

    /* Assembly, per piece, added to every framed quote unless overridden at
     * the counter. Kept in settings rather than the price list because it is
     * the shop's own labour, not something bought in. */
    defaultLabour: { type: Number, default: 0, min: 0 },

    updatedBy: ref('User'),
  },
  opts
);

/* ------------------------------------------------------------------ *
 * Accounting
 *
 * A real double-entry ledger. Every journal entry must balance, and every
 * entry names the record it came from (`sourceKey`) so the whole ledger can
 * be rebuilt from the operational data if the two ever drift apart.
 * ------------------------------------------------------------------ */

export const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'cogs', 'expense'];

// Which side of an account increases it.
export const NORMAL_BALANCE = {
  asset: 'debit',
  liability: 'credit',
  equity: 'credit',
  income: 'credit',
  cogs: 'debit',
  expense: 'debit',
};

const AccountSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    type: { type: String, enum: ACCOUNT_TYPES, required: true, index: true },
    // A contra account sits against its type (accumulated depreciation is an
    // asset that carries a credit balance; discounts allowed reduce income).
    contra: { type: Boolean, default: false },
    description: String,
    system: { type: Boolean, default: true }, // created by the app, not deletable
    active: { type: Boolean, default: true },
  },
  opts
);

const JournalLineSchema = new Schema(
  {
    account: { ...ref('Account'), required: true },
    code: String,
    name: String,
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    memo: String,
  },
  { _id: false }
);

const JournalEntrySchema = new Schema(
  {
    entryNumber: { type: String, index: true },
    date: { type: Date, required: true, index: true },
    memo: String,
    lines: [JournalLineSchema],
    total: { type: Number, default: 0 }, // the debit side; equals the credit side
    // "sale:663f…", "payment:663f…". Unique, so replaying a posting or
    // rebuilding the ledger can never double-count a transaction.
    // Indexed explicitly below — declaring `index: true` here as well would
    // make Mongoose ask for two indexes with the same auto-generated name.
    sourceKey: { type: String },
    sourceType: { type: String, index: true },
    sourceId: String,
    manual: { type: Boolean, default: false }, // typed in by the owner
    createdBy: ref('User'),
    createdByName: String,
  },
  opts
);
JournalEntrySchema.index({ date: -1 });
JournalEntrySchema.index(
  { sourceKey: 1 },
  { unique: true, partialFilterExpression: { sourceKey: { $type: 'string' } } }
);

/* ------------------------------------------------------------------ *
 * Procurement
 * ------------------------------------------------------------------ */

export const PO_STATUSES = ['draft', 'sent', 'part_received', 'received', 'cancelled'];

const PurchaseOrderItemSchema = new Schema(
  {
    material: { ...ref('Material'), required: true },
    name: String,
    unit: String,
    quantity: { type: Number, required: true, min: 0 },
    received: { type: Number, default: 0 },
    unitCost: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

const PurchaseOrderSchema = new Schema(
  {
    poNumber: { type: String, unique: true, index: true },
    supplier: { ...ref('Supplier'), required: true },
    supplierName: String,
    items: [PurchaseOrderItemSchema],
    subtotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    // What has been billed and paid against this order.
    amountPaid: { type: Number, default: 0 },
    balance: { type: Number, default: 0, index: true },
    status: { type: String, enum: PO_STATUSES, default: 'draft', index: true },
    expectedDate: Date,
    receivedAt: Date,
    // Deliveries can arrive in parts. Each receipt is kept separately, and
    // its position in this array is what the ledger posts against — so a
    // rebuild produces exactly the same entries every time.
    receipts: [
      {
        at: { type: Date, default: Date.now },
        by: String,
        value: { type: Number, default: 0 },
        lines: [{ material: ref('Material'), name: String, quantity: Number, unitCost: Number, _id: false }],
        _id: false,
      },
    ],
    supplierInvoiceNo: String,
    notes: String,
    createdBy: ref('User'),
    createdByName: String,
  },
  opts
);
PurchaseOrderSchema.index({ createdAt: -1 });

const SupplierPaymentSchema = new Schema(
  {
    purchaseOrder: { ...ref('PurchaseOrder'), index: true },
    poNumber: String,
    supplier: ref('Supplier'),
    supplierName: String,
    amount: { type: Number, required: true },
    method: { type: String, enum: PAYMENT_METHODS, default: 'transfer' },
    reference: String,
    note: String,
    paidBy: ref('User'),
    paidByName: String,
  },
  opts
);
SupplierPaymentSchema.index({ createdAt: -1 });

/* ------------------------------------------------------------------ *
 * Fixed assets
 * ------------------------------------------------------------------ */

export const ASSET_CATEGORIES = [
  'Printing press',
  'Large-format printer',
  'Cutting machine',
  'Laminating machine',
  'Binding machine',
  'Computer',
  'Generator',
  'Furniture',
  'Vehicle',
  'Other',
];

const FixedAssetSchema = new Schema(
  {
    name: { type: String, required: true },
    category: { type: String, enum: ASSET_CATEGORIES, default: 'Other', index: true },
    purchaseDate: { type: Date, required: true },
    cost: { type: Number, required: true, min: 0 },
    // Straight line: (cost − residual) spread evenly over the useful life.
    usefulLifeMonths: { type: Number, default: 60, min: 1 },
    residualValue: { type: Number, default: 0 },
    accumulatedDepreciation: { type: Number, default: 0 },
    paidBy: { type: String, enum: PAYMENT_METHODS, default: 'transfer' },
    supplier: ref('Supplier'),
    serialNumber: String,
    location: String,
    notes: String,
    disposed: { type: Boolean, default: false },
    disposedAt: Date,
    disposalProceeds: Number,
    createdBy: ref('User'),
    createdByName: String,
  },
  opts
);

const DepreciationRunSchema = new Schema(
  {
    // One run per calendar month, enforced by the unique index.
    period: { type: String, required: true, unique: true }, // "2026-07"
    runAt: { type: Date, default: Date.now },
    total: { type: Number, default: 0 },
    lines: [
      {
        asset: ref('FixedAsset'),
        name: String,
        amount: Number,
        _id: false,
      },
    ],
    createdBy: ref('User'),
    createdByName: String,
  },
  opts
);

const CounterSchema = new Schema({
  _id: String,
  seq: { type: Number, default: 0 },
});

/* ------------------------------------------------------------------ *
 * Offline-safety.
 *
 * When a device records a sale with no network, the write sits in a local
 * queue and is replayed later. If the original request actually reached the
 * server but its response was lost, the replay would create a duplicate —
 * a second invoice for money taken once.
 *
 * Each queued write therefore carries a `clientRef` generated on the device.
 * A unique index makes a duplicate physically impossible, and the routes
 * return the original record instead of erroring.
 * ------------------------------------------------------------------ */
const clientRefIndex = {
  unique: true,
  partialFilterExpression: { clientRef: { $type: 'string' } },
};
JobSchema.index({ clientRef: 1 }, clientRefIndex);
SaleSchema.index({ clientRef: 1 }, clientRefIndex);
PaymentSchema.index({ clientRef: 1 }, clientRefIndex);
ExpenseSchema.index({ clientRef: 1 }, clientRefIndex);

/* ------------------------------------------------------------------ *
 * `mongoose.models.X || model(...)` guards against "OverwriteModelError"
 * during hot reload in dev.
 * ------------------------------------------------------------------ */
const m = mongoose.models;

export const User = m.User || mongoose.model('User', UserSchema);
export const Customer = m.Customer || mongoose.model('Customer', CustomerSchema);
export const Supplier = m.Supplier || mongoose.model('Supplier', SupplierSchema);
export const Material = m.Material || mongoose.model('Material', MaterialSchema);
export const StockMovement = m.StockMovement || mongoose.model('StockMovement', StockMovementSchema);
export const PriceItem = m.PriceItem || mongoose.model('PriceItem', PriceItemSchema);
export const Job = m.Job || mongoose.model('Job', JobSchema);
export const Sale = m.Sale || mongoose.model('Sale', SaleSchema);
export const Payment = m.Payment || mongoose.model('Payment', PaymentSchema);
export const Expense = m.Expense || mongoose.model('Expense', ExpenseSchema);
export const Account = m.Account || mongoose.model('Account', AccountSchema);
export const JournalEntry = m.JournalEntry || mongoose.model('JournalEntry', JournalEntrySchema);
export const PurchaseOrder = m.PurchaseOrder || mongoose.model('PurchaseOrder', PurchaseOrderSchema);
export const SupplierPayment = m.SupplierPayment || mongoose.model('SupplierPayment', SupplierPaymentSchema);
export const FixedAsset = m.FixedAsset || mongoose.model('FixedAsset', FixedAssetSchema);
export const DepreciationRun = m.DepreciationRun || mongoose.model('DepreciationRun', DepreciationRunSchema);
export const RegisterSession = m.RegisterSession || mongoose.model('RegisterSession', RegisterSessionSchema);
export const AuditLog = m.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
export const Settings = m.Settings || mongoose.model('Settings', SettingsSchema);
export const Counter = m.Counter || mongoose.model('Counter', CounterSchema);
