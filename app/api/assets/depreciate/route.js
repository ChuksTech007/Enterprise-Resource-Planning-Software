import { route, bad } from '@/lib/http';
import { FixedAsset, DepreciationRun } from '@/lib/models';
import { postSafely } from '@/lib/accounting/ledger';
import { postingsForDepreciation } from '@/lib/accounting/postings';
import { monthlyDepreciation } from '@/lib/accounting/assets';
import { logAction } from '@/lib/audit';
import { money, APP_TZ } from '@/lib/util';

export const dynamic = 'force-dynamic';

export const GET = route(
  async () => {
    const runs = await DepreciationRun.find({}).sort({ period: -1 }).limit(24).lean();
    return { runs, suggestedPeriod: currentPeriod() };
  },
  { role: 'owner' }
);

/**
 * Run depreciation for a month.
 *
 * One run per calendar month, enforced by a unique index on `period` — so
 * clicking twice cannot write the machines down twice. An asset stops
 * depreciating once it reaches its residual value.
 */
export const POST = route(
  async ({ body, user, req }) => {
    const period = String(body.period || currentPeriod());
    if (!/^\d{4}-\d{2}$/.test(period)) throw bad('Period must look like 2026-07');

    const existing = await DepreciationRun.findOne({ period });
    if (existing) throw bad(`Depreciation for ${period} has already been run.`);

    // Depreciate as at the end of that month.
    const [year, month] = period.split('-').map(Number);
    const asAt = new Date(Date.UTC(year, month, 0, 23, 59, 59));

    const assets = await FixedAsset.find({ disposed: false, purchaseDate: { $lte: asAt } });

    const lines = [];
    let total = 0;

    for (const asset of assets) {
      const perMonth = monthlyDepreciation(asset);
      if (perMonth <= 0) continue;

      const floor = money(asset.residualValue || 0);
      const remaining = money(asset.cost - (asset.accumulatedDepreciation || 0) - floor);
      if (remaining <= 0) continue; // fully written down

      // The final month takes only what is left, never past the residual.
      const amount = money(Math.min(perMonth, remaining));
      if (amount <= 0) continue;

      asset.accumulatedDepreciation = money((asset.accumulatedDepreciation || 0) + amount);
      await asset.save();

      lines.push({ asset: asset._id, name: asset.name, amount });
      total = money(total + amount);
    }

    if (!lines.length) throw bad('There is nothing to depreciate for that month.');

    const run = await DepreciationRun.create({
      period,
      runAt: new Date(),
      total,
      lines,
      createdBy: user._id,
      createdByName: user.name,
    });

    await postSafely(postingsForDepreciation(run.toObject()));

    await logAction(user, 'asset.depreciate', {
      entity: 'DepreciationRun',
      entityId: run._id,
      label: `Depreciation for ${period}: ${total} across ${lines.length} asset(s)`,
      details: { period, total },
      req,
    });

    return { run: run.toObject() };
  },
  { role: 'owner' }
);

function currentPeriod() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TZ,
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
  return parts.slice(0, 7);
}
