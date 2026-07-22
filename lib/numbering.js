import { Counter } from './models.js';

/**
 * Atomically allocate the next number in a sequence.
 * findOneAndUpdate with $inc is a single atomic operation, so two cashiers
 * saving at the same instant can never be handed the same invoice number.
 */
export async function nextNumber(key, prefix, pad = 5) {
  const doc = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return `${prefix}-${String(doc.seq).padStart(pad, '0')}`;
}

export const nextJobNumber = () => nextNumber('job', 'JOB');
export const nextInvoiceNumber = () => nextNumber('invoice', 'INV');
