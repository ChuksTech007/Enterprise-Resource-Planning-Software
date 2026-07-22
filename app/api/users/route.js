import { route, bad } from '@/lib/http';
import { User, ROLES } from '@/lib/models';
import { hashPassword } from '@/lib/auth';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// Cashiers may read the staff list (they need it to assign jobs) but never
// see anything sensitive — the projection is the guard, not the UI.
export const GET = route(async ({ user }) => {
  const select = user.role === 'owner' ? '-passwordHash' : 'name role active';
  const users = await User.find({}).select(select).sort({ name: 1 }).lean();
  return { users, roles: ROLES };
});

export const POST = route(
  async ({ body, user, req }) => {
    const name = body.name?.trim();
    const username = String(body.username || '').toLowerCase().trim();
    const password = String(body.password || '');

    if (!name) throw bad("Enter the staff member's name");
    if (!/^[a-z0-9._-]{3,}$/.test(username)) {
      throw bad('Username must be at least 3 characters — letters, numbers, dot, dash or underscore');
    }
    if (password.length < 6) throw bad('Password must be at least 6 characters');
    if (!ROLES.includes(body.role)) throw bad('Choose a role');

    const created = await User.create({
      name,
      username,
      passwordHash: await hashPassword(password),
      role: body.role,
      phone: body.phone?.trim(),
    });

    await logAction(user, 'user.create', {
      entity: 'User',
      entityId: created._id,
      label: `Created ${created.role} account for ${created.name}`,
      req,
    });

    const { passwordHash, ...safe } = created.toObject();
    return { user: safe };
  },
  { role: 'owner' }
);
