import { route } from '@/lib/http';
import { Settings } from '@/lib/models';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const settings = await Settings.findOne({ key: 'main' }).lean();
  return { settings: settings || { key: 'main', businessName: "Master's Technology", currency: '₦' } };
});

export const PUT = route(
  async ({ body, user, req }) => {
    const fields = [
      'businessName',
      'address',
      'phone',
      'email',
      'currency',
      'receiptFooter',
      'ownerEmail',
      'ownerWhatsapp',
      'lowStockNagging',
    ];

    const update = { updatedBy: user._id };
    for (const f of fields) if (body[f] !== undefined) update[f] = body[f];

    const settings = await Settings.findOneAndUpdate({ key: 'main' }, update, {
      returnDocument: 'after',
      upsert: true,
      setDefaultsOnInsert: true,
    }).lean();

    await logAction(user, 'settings.update', {
      entity: 'Settings',
      label: 'Updated business settings',
      details: update,
      req,
    });

    return { settings };
  },
  { role: 'owner' }
);
