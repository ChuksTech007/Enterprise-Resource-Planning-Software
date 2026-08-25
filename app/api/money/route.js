import { route } from '@/lib/http';
import { moneyPosition } from '@/lib/money-position';
import { resolveRange } from '@/lib/util';

export const dynamic = 'force-dynamic';

/**
 * Money in, money out, and what is left.
 *
 * Owner-only, and not because of squeamishness: it carries running costs and
 * what has been paid to suppliers, which is the shop's buying position. A
 * cashier who can read it can work out the margin on every job they sell.
 *
 * `period=all` gives the position since the shop opened, which is what
 * "overall" means when nobody has picked a month.
 */
export const GET = route(
  async ({ query }) => {
    if (query.period === 'all') {
      return { ...(await moneyPosition({})), label: 'Since you started' };
    }

    const range = resolveRange(query);
    return {
      ...(await moneyPosition({ from: range.from, to: range.to })),
      label: range.label,
    };
  },
  { role: 'owner' }
);
