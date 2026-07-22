import { route, notFound } from '@/lib/http';
import { Job, Customer, Settings } from '@/lib/models';
import { quoteMessage, waUrl, smsUrl } from '@/lib/share';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Prepare a quote or job confirmation to send the customer on WhatsApp. */
export const POST = route(async ({ params, user, req }) => {
  const job = await Job.findById(params.id).lean();
  if (!job) throw notFound('Job not found');

  const settings = (await Settings.findOne({ key: 'main' }).lean()) || {};
  const customer = job.customer ? await Customer.findById(job.customer).select('phone').lean() : null;
  const phone = customer?.phone;

  const message = quoteMessage(job, settings);

  await logAction(user, 'job.share', {
    entity: 'Job',
    entityId: job._id,
    label: `Sent ${job.status === 'quote' ? 'quote' : 'job details'} ${job.jobNumber} to ${job.customerName}`,
    req,
  });

  return {
    message,
    phone,
    whatsappUrl: waUrl(phone, message),
    smsUrl: smsUrl(phone, message),
  };
});
