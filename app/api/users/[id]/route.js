import { route, notFound, bad } from '@/lib/http';
import { User, ROLES } from '@/lib/models';
import { hashPassword } from '@/lib/auth';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export const PATCH = route(
  async ({ params, body, user, req }) => {
    const target = await User.findById(params.id);
    if (!target) throw notFound('Staff member not found');

    if (body.name !== undefined) target.name = body.name.trim();
    if (body.phone !== undefined) target.phone = body.phone?.trim();

    if (body.role !== undefined) {
      if (!ROLES.includes(body.role)) throw bad('Choose a valid role');
      // Never let the last owner demote themselves — that would lock the
      // business out of its own reports with no way back in.
      if (target.role === 'owner' && body.role !== 'owner') {
        const owners = await User.countDocuments({ role: 'owner', active: true });
        if (owners <= 1) throw bad('This is the only owner account. Create another owner first.');
      }
      target.role = body.role;
    }

    if (body.active !== undefined) {
      if (String(target._id) === String(user._id) && !body.active) {
        throw bad('You cannot disable your own account');
      }
      if (target.role === 'owner' && !body.active) {
        const owners = await User.countDocuments({ role: 'owner', active: true });
        if (owners <= 1) throw bad('This is the only owner account and cannot be disabled');
      }
      target.active = !!body.active;
    }

    if (body.password) {
      if (String(body.password).length < 6) throw bad('Password must be at least 6 characters');
      target.passwordHash = await hashPassword(String(body.password));
    }

    await target.save();

    await logAction(user, 'user.update', {
      entity: 'User',
      entityId: target._id,
      label: `Updated staff account "${target.name}"${body.password ? ' (password reset)' : ''}`,
      details: { role: target.role, active: target.active },
      req,
    });

    const { passwordHash, ...safe } = target.toObject();
    return { user: safe };
  },
  { role: 'owner' }
);
