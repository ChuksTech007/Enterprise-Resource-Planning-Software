import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import { Settings } from '@/lib/models';
import { AppProvider } from '@/components/AppProvider';
import Shell from '@/components/Shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }) {
  // The middleware has already checked the token; this re-checks against the
  // database so a disabled account cannot keep browsing on an old cookie.
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  await dbConnect();
  const settings = await Settings.findOne({ key: 'main' }).lean();

  return (
    <AppProvider
      initialUser={{ id: String(user._id), name: user.name, role: user.role, username: user.username }}
      initialSettings={
        settings
          ? { ...settings, _id: String(settings._id), updatedBy: undefined }
          : { businessName: "Master's Technology", currency: '₦' }
      }
    >
      <Shell>{children}</Shell>
    </AppProvider>
  );
}
