import { JournalEntry, Account } from '../models.js';
import { money } from '../util.js';
import { ensureAccounts, accountMap } from './coa.js';
import { nextNumber } from '../numbering.js';

/**
 * The posting engine.
 *
 * Two rules are enforced here and nowhere else, because they are what make a
 * ledger trustworthy:
 *
 *   1. Every entry balances — total debits equal total credits, to the kobo.
 *      An unbalanced entry is refused rather than saved and reconciled later.
 *
 *   2. Every entry that comes from a transaction carries a `sourceKey`
 *      ("payment:663f…"), unique in the database. Posting the same event
 *      twice is therefore impossible, which is what lets the whole ledger be
 *      rebuilt from the operational records without double-counting.
 */

/** Refuse to post anything that does not balance. */
export function assertBalanced(lines) {
  const debit = money(lines.reduce((s, l) => s + (l.debit || 0), 0));
  const credit = money(lines.reduce((s, l) => s + (l.credit || 0), 0));

  if (debit !== credit) {
    throw new Error(
      `Journal entry does not balance: debits ${debit} vs credits ${credit}. ` +
        lines.map((l) => `${l.code} Dr${l.debit || 0} Cr${l.credit || 0}`).join('; ')
    );
  }
  if (debit === 0) throw new Error('Journal entry has no value');

  // A single line cannot carry both sides — that is always a mistake.
  for (const l of lines) {
    if ((l.debit || 0) > 0 && (l.credit || 0) > 0) {
      throw new Error(`Line ${l.code} has both a debit and a credit`);
    }
  }

  return debit;
}

/**
 * Write one journal entry.
 *
 * `lines` are given as { code, debit?, credit?, memo? } — codes rather than
 * ids, so the posting rules stay readable.
 */
export async function postEntry({ date, memo, lines, sourceKey, sourceType, sourceId, manual = false, user }) {
  if (!lines?.length) return null;

  // Drop zero-value lines before balancing; they are noise, not errors.
  const clean = lines
    .map((l) => ({ ...l, debit: money(l.debit || 0), credit: money(l.credit || 0) }))
    .filter((l) => l.debit > 0 || l.credit > 0);

  if (!clean.length) return null;

  const total = assertBalanced(clean);

  let byCode = await accountMap();
  const missing = clean.filter((l) => !byCode[l.code]);
  if (missing.length) {
    // First posting on a fresh database, or a new account added in code.
    await ensureAccounts();
    byCode = await accountMap();
  }

  const resolved = clean.map((l) => {
    const account = byCode[l.code];
    if (!account) throw new Error(`No account with code ${l.code}`);
    return {
      account: account._id,
      code: account.code,
      name: account.name,
      debit: l.debit,
      credit: l.credit,
      memo: l.memo,
    };
  });

  try {
    return await JournalEntry.create({
      entryNumber: await nextNumber('journal', 'JE', 6),
      date: date || new Date(),
      memo,
      lines: resolved,
      total,
      sourceKey,
      sourceType,
      sourceId: sourceId ? String(sourceId) : undefined,
      manual,
      createdBy: user?._id,
      createdByName: user?.name,
    });
  } catch (err) {
    // Already posted. That is the guard doing its job, not a failure.
    if (err?.code === 11000) return JournalEntry.findOne({ sourceKey }).lean();
    throw err;
  }
}

/**
 * Post without ever throwing into the caller.
 *
 * Bookkeeping must never be able to roll back a sale that has already been
 * taken. If a posting fails, the money is still recorded operationally and
 * `npm run rebuild-ledger` will pick it up.
 */
export async function postSafely(entry) {
  // A posting rule returning null means "nothing to post here" — a delivery
  // against a purchase order, say, which the order books itself.
  if (!entry) return null;

  try {
    return await postEntry(entry);
  } catch (err) {
    console.error('[ledger] posting failed for', entry?.sourceKey, '—', err.message);
    return null;
  }
}

/** Remove a posting, used when a transaction is voided and re-posted. */
export async function unpost(sourceKey) {
  if (!sourceKey) return;
  await JournalEntry.deleteOne({ sourceKey });
}

/**
 * Account balances over a period.
 * Returns a map: code -> { debit, credit, balance } where `balance` is signed
 * in the account's normal direction.
 */
export async function accountBalances({ from, to } = {}) {
  const match = {};
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = from;
    if (to) match.date.$lte = to;
  }

  const rows = await JournalEntry.aggregate([
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    { $unwind: '$lines' },
    {
      $group: {
        _id: '$lines.code',
        debit: { $sum: '$lines.debit' },
        credit: { $sum: '$lines.credit' },
      },
    },
  ]);

  const accounts = await Account.find({}).sort({ code: 1 }).lean();
  const out = {};

  for (const a of accounts) {
    const row = rows.find((r) => r._id === a.code);
    const debit = money(row?.debit || 0);
    const credit = money(row?.credit || 0);

    // Assets and expenses grow on the debit side; everything else on credit.
    //
    // Contra accounts are deliberately NOT flipped here. Accumulated
    // depreciation is an asset account carrying a credit balance, so
    // (debit − credit) already comes out negative — which is exactly what it
    // should contribute to total assets. Flipping it made it positive and
    // inflated the balance sheet by twice the depreciation. `contra` is kept
    // on the account for labelling, not for arithmetic.
    const debitNormal = ['asset', 'cogs', 'expense'].includes(a.type);

    out[a.code] = {
      code: a.code,
      name: a.name,
      type: a.type,
      contra: a.contra,
      debit,
      credit,
      balance: money(debitNormal ? debit - credit : credit - debit),
    };
  }

  return out;
}
