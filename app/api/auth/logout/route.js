import { route } from '@/lib/http';
import { clearSessionCookie } from '@/lib/auth';
import { logAction } from '@/lib/audit';

export const POST = route(async ({ user, req }) => {
  if (user) {
    await logAction(user, 'auth.logout', { entity: 'User', entityId: user._id, label: `${user.name} signed out`, req });
  }
  await clearSessionCookie();
  return { ok: true };
});
