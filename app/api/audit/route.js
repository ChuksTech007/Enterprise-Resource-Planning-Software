import { route } from '@/lib/http';
import { AuditLog } from '@/lib/models';
import { num, resolveRange } from '@/lib/util';

export const dynamic = 'force-dynamic';

export const GET = route(
  async ({ query }) => {
    const filter = {};
    if (query.user) filter.user = query.user;
    if (query.action && query.action !== 'all') filter.action = new RegExp('^' + query.action);
    if (query.entity) filter.entity = query.entity;
    if (query.entityId) filter.entityId = String(query.entityId);

    if (query.period || query.from || query.to) {
      const { from, to } = resolveRange(query);
      filter.createdAt = { $gte: from, $lte: to };
    }

    const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(num(query.limit, 200)).lean();
    const actions = await AuditLog.distinct('action');

    return { logs, actions: actions.sort() };
  },
  { role: 'owner' }
);
