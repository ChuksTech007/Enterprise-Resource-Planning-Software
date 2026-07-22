import { AuditLog } from './models.js';

/**
 * Record who did what, when. Never throws — an audit failure must not be
 * able to roll back a sale that has already been taken.
 */
export async function logAction(user, action, { entity, entityId, label, details, req } = {}) {
  try {
    await AuditLog.create({
      user: user?._id,
      userName: user?.name || 'system',
      role: user?.role,
      action,
      entity,
      entityId: entityId ? String(entityId) : undefined,
      label,
      details,
      ip: req?.headers?.get?.('x-forwarded-for')?.split(',')[0]?.trim(),
    });
  } catch (err) {
    console.error('[audit] failed to write log', action, err?.message);
  }
}
