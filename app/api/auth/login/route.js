import { route, ApiError, bad } from '@/lib/http';
import { User } from '@/lib/models';
import { verifyPassword, signSession, setSessionCookie } from '@/lib/auth';
import { logAction } from '@/lib/audit';

// After this many wrong passwords the account is locked for a while. Five is
// generous for a real person mistyping, and useless for anyone guessing.
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export const POST = route(
  async ({ body, req }) => {
    const username = String(body.username || '').toLowerCase().trim();
    const password = String(body.password || '');
    if (!username || !password) throw bad('Enter your username and password');

    const user = await User.findOne({ username });

    // Same message for "no such user" and "wrong password", so the login form
    // cannot be used to discover which usernames exist.
    const invalid = new ApiError(401, 'Incorrect username or password');
    if (!user) throw invalid;

    if (user.lockUntil && user.lockUntil > new Date()) {
      const mins = Math.ceil((user.lockUntil - Date.now()) / 60000);
      throw new ApiError(
        429,
        `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}, or ask the owner to reset your password.`
      );
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
      user.failedLoginCount = (user.failedLoginCount || 0) + 1;

      if (user.failedLoginCount >= MAX_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
        user.failedLoginCount = 0;
        await user.save();
        await logAction(user, 'auth.locked', {
          entity: 'User',
          entityId: user._id,
          label: `${user.name}'s account locked after ${MAX_ATTEMPTS} failed sign-in attempts`,
          req,
        });
        throw new ApiError(429, `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.`);
      }

      await user.save();
      throw invalid;
    }

    if (!user.active) throw new ApiError(403, 'This account has been disabled. Ask the owner.');

    user.lastLoginAt = new Date();
    user.failedLoginCount = 0;
    user.lockUntil = undefined;
    await user.save();

    await setSessionCookie(await signSession(user));
    await logAction(user, 'auth.login', {
      entity: 'User',
      entityId: user._id,
      label: `${user.name} signed in`,
      req,
    });

    return { user: { id: String(user._id), name: user.name, role: user.role, username: user.username } };
  },
  { role: 'public' }
);
