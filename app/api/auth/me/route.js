import { route } from '@/lib/http';
import { Settings, RegisterSession } from '@/lib/models';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ user }) => {
  const settings = await Settings.findOne({ key: 'main' }).lean();

  // The shell needs to know whether this cashier has an open till, so it can
  // nudge them to open one before taking cash.
  const openRegister = await RegisterSession.findOne({ user: user._id, status: 'open' })
    .select('_id openedAt openingFloat')
    .lean();

  return {
    user: { id: user._id, name: user.name, role: user.role, username: user.username },
    settings: settings
      ? { ...settings, _id: String(settings._id) }
      : { businessName: 'My Printing Press', currency: '₦' },
    openRegister: openRegister ? { ...openRegister, _id: String(openRegister._id) } : null,
  };
});
