import { Customer } from './models.js';

/**
 * Turn whatever the counter typed into a customer record.
 *
 * Cashiers should not have to stop and "create a customer" before taking an
 * order, so a name (and ideally a phone number) typed straight into the job
 * form is enough. Matching on phone first keeps one person from ending up as
 * three records with their debt split between them.
 */
export async function resolveCustomer({ customerId, name, phone, user }) {
  if (customerId) {
    const existing = await Customer.findById(customerId);
    if (existing) return existing;
  }

  const cleanPhone = String(phone || '').trim();
  if (cleanPhone) {
    const byPhone = await Customer.findOne({ phone: cleanPhone });
    if (byPhone) return byPhone;
  }

  const cleanName = String(name || '').trim();
  if (!cleanName) return null;

  // Without a phone number, fall back to an exact (case-insensitive) name match.
  if (!cleanPhone) {
    const byName = await Customer.findOne({
      name: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });
    if (byName) return byName;
  }

  return Customer.create({ name: cleanName, phone: cleanPhone || undefined, createdBy: user?._id });
}
