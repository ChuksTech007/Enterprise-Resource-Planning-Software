import { route } from '@/lib/http';
import { buildReport } from '@/lib/reports';
import { resolveRange } from '@/lib/util';

export const dynamic = 'force-dynamic';

// Owner-only. Reports carry cost prices, margins and per-staff performance —
// all three are things a cashier is not meant to see, so the whole endpoint is
// gated rather than trying to filter it field by field.
export const GET = route(
  async ({ query }) => {
    const range = resolveRange(query);
    const report = await buildReport(range);
    return { ...report, label: range.label, period: range.period };
  },
  { role: 'owner' }
);
