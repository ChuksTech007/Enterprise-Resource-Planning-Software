import { route, bad } from '@/lib/http';
import { JournalEntry, Account } from '@/lib/models';
import { trialBalance, profitAndLoss, balanceSheet, rebuildLedger } from '@/lib/accounting/statements';
import { ensureAccounts } from '@/lib/accounting/coa';
import { logAction } from '@/lib/audit';
import { num, resolveRange } from '@/lib/util';

export const dynamic = 'force-dynamic';

/**
 * The financial statements. Owner-only, without exception — this is the
 * complete financial picture of the business.
 */
export const GET = route(
  async ({ query }) => {
    await ensureAccounts();

    const range = resolveRange(query);
    const report = query.report || 'overview';

    if (report === 'trial-balance') {
      return { ...(await trialBalance({ from: range.from, to: range.to })), label: range.label };
    }

    if (report === 'profit-loss') {
      return { ...(await profitAndLoss({ from: range.from, to: range.to })), label: range.label };
    }

    if (report === 'balance-sheet') {
      return { ...(await balanceSheet({ asAt: range.to })), label: range.label };
    }

    if (report === 'journal') {
      const filter = { date: { $gte: range.from, $lte: range.to } };
      if (query.sourceType && query.sourceType !== 'all') filter.sourceType = query.sourceType;

      const entries = await JournalEntry.find(filter).sort({ date: -1, createdAt: -1 }).limit(num(query.limit, 200)).lean();
      const sourceTypes = await JournalEntry.distinct('sourceType');
      return { entries, sourceTypes: sourceTypes.filter(Boolean).sort(), label: range.label };
    }

    if (report === 'accounts') {
      return { accounts: await Account.find({}).sort({ code: 1 }).lean() };
    }

    // Overview: everything the owner needs on one screen.
    const [tb, pl, bs] = await Promise.all([
      trialBalance({ from: range.from, to: range.to }),
      profitAndLoss({ from: range.from, to: range.to }),
      balanceSheet({ asAt: range.to }),
    ]);

    return { label: range.label, period: range.period, trialBalance: tb, profitLoss: pl, balanceSheet: bs };
  },
  { role: 'owner' }
);

/**
 * Rebuild the ledger from the operational records.
 *
 * The escape hatch. If a posting ever failed — a blip mid-transaction, or a
 * bug since fixed — this regenerates every entry from the sales, payments,
 * movements and expenses. Manual journal entries are preserved.
 */
export const POST = route(
  async ({ body, user, req }) => {
    if (body.action !== 'rebuild') throw bad('Unknown action');

    const log = [];
    const result = await rebuildLedger({ user, onProgress: (m) => log.push(m) });

    await logAction(user, 'accounting.rebuild', {
      entity: 'JournalEntry',
      label: `Rebuilt the ledger — ${result.balanced ? 'balanced' : `OUT BY ${result.difference}`}`,
      details: result,
      req,
    });

    return { ...result, log };
  },
  { role: 'owner' }
);
