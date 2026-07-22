import { route, bad } from '@/lib/http';
import { FixedAsset, ASSET_CATEGORIES, PAYMENT_METHODS } from '@/lib/models';
import { postSafely } from '@/lib/accounting/ledger';
import { postingsForAsset } from '@/lib/accounting/postings';
import { monthlyDepreciation, bookValue, isFullyDepreciated } from '@/lib/accounting/assets';
import { logAction } from '@/lib/audit';
import { money, num } from '@/lib/util';

export const dynamic = 'force-dynamic';

export const GET = route(
  async ({ query }) => {
    const filter = query.includeDisposed === '1' ? {} : { disposed: false };
    if (query.category && query.category !== 'all') filter.category = query.category;

    const assets = await FixedAsset.find(filter).sort({ purchaseDate: -1 }).lean();

    const rows = assets.map((a) => {
      const perMonth = monthlyDepreciation(a);
      const value = bookValue(a);
      return {
        ...a,
        monthlyDepreciation: perMonth,
        bookValue: value,
        monthsRemaining: perMonth > 0 ? Math.max(0, Math.round((value - (a.residualValue || 0)) / perMonth)) : 0,
        fullyDepreciated: isFullyDepreciated(a),
      };
    });

    return {
      assets: rows,
      categories: ASSET_CATEGORIES,
      totals: {
        cost: money(rows.reduce((s, a) => s + a.cost, 0)),
        accumulated: money(rows.reduce((s, a) => s + (a.accumulatedDepreciation || 0), 0)),
        bookValue: money(rows.reduce((s, a) => s + a.bookValue, 0)),
        monthly: money(rows.reduce((s, a) => s + (a.fullyDepreciated ? 0 : a.monthlyDepreciation), 0)),
      },
    };
  },
  { role: 'owner' }
);

export const POST = route(
  async ({ body, user, req }) => {
    if (!body.name?.trim()) throw bad('Give the asset a name');
    const cost = money(body.cost);
    if (!(cost > 0)) throw bad('Enter what it cost');
    if (!body.purchaseDate) throw bad('When was it bought?');

    const life = num(body.usefulLifeMonths, 60);
    if (life < 1) throw bad('Useful life must be at least one month');

    const residual = money(body.residualValue);
    if (residual >= cost) throw bad('The residual value must be less than the cost');

    const asset = await FixedAsset.create({
      name: body.name.trim(),
      category: ASSET_CATEGORIES.includes(body.category) ? body.category : 'Other',
      purchaseDate: new Date(body.purchaseDate),
      cost,
      usefulLifeMonths: life,
      residualValue: residual,
      paidBy: PAYMENT_METHODS.includes(body.paidBy) ? body.paidBy : 'transfer',
      supplier: body.supplier || undefined,
      serialNumber: body.serialNumber?.trim(),
      location: body.location?.trim(),
      notes: body.notes?.trim(),
      createdBy: user._id,
      createdByName: user.name,
    });

    // Buying a machine is not a cost — it swaps money for something worth the
    // same. The cost appears month by month, as depreciation.
    await postSafely(postingsForAsset(asset.toObject()));

    await logAction(user, 'asset.create', {
      entity: 'FixedAsset',
      entityId: asset._id,
      label: `Added asset "${asset.name}" at ${cost}`,
      details: { cost, life },
      req,
    });

    return { asset: asset.toObject() };
  },
  { role: 'owner' }
);
