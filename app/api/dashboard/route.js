import { route, scrubCosts } from '@/lib/http';
import { Sale, Payment, Job, RegisterSession, Material } from '@/lib/models';
import { lowStockItems } from '@/lib/stock';
import { money, startOfDay, endOfDay } from '@/lib/util';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ user }) => {
  const from = startOfDay();
  const to = endOfDay();
  const today = { $gte: from, $lte: to };
  const isOwner = user.role === 'owner';

  // A cashier's dashboard shows their own takings; the owner's shows the shop's.
  const paymentScope = isOwner ? { createdAt: today, voided: false } : { createdAt: today, voided: false, receivedBy: user._id };

  const [methodAgg, jobsToday, readyForPickup, overdueJobs, rushJobs, outstandingAgg, openTills, low, materialCount] =
    await Promise.all([
      Payment.aggregate([
        { $match: paymentScope },
        { $group: { _id: '$method', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),

      Job.countDocuments({ createdAt: today, status: { $ne: 'cancelled' } }),

      Job.find({ collectionStatus: 'ready' })
        .sort({ updatedAt: -1 })
        .limit(25)
        .select('jobNumber customerName jobType price updatedAt isRush')
        .lean(),

      // Work that is late: past deadline and not yet finished.
      Job.find({
        deadline: { $lt: new Date() },
        status: { $in: ['approved', 'printing', 'finishing'] },
      })
        .sort({ deadline: 1 })
        .limit(25)
        .select('jobNumber customerName jobType deadline status isRush')
        .lean(),

      Job.countDocuments({ isRush: true, status: { $in: ['approved', 'printing', 'finishing'] } }),

      Sale.aggregate([
        { $match: { voided: false, balance: { $gt: 0 } } },
        { $group: { _id: null, owed: { $sum: '$balance' }, count: { $sum: 1 } } },
      ]),

      isOwner
        ? RegisterSession.find({ status: 'open' }).select('userName openedAt openingFloat').lean()
        : Promise.resolve([]),

      lowStockItems(),

      Material.countDocuments({ active: true }),
    ]);

  const byMethod = { cash: 0, transfer: 0, pos: 0, online: 0 };
  let paymentCount = 0;
  for (const m of methodAgg) {
    byMethod[m._id] = money(m.total);
    paymentCount += m.count;
  }

  const openRegister = await RegisterSession.findOne({ user: user._id, status: 'open' })
    .select('openedAt openingFloat')
    .lean();

  return scrubCosts(
    {
      isOwner,
      today: {
        collected: money(Object.values(byMethod).reduce((a, b) => a + b, 0)),
        byMethod,
        paymentCount,
        jobsCreated: jobsToday,
      },
      outstanding: {
        total: money(outstandingAgg[0]?.owed || 0),
        count: outstandingAgg[0]?.count || 0,
      },
      readyForPickup,
      overdueJobs,
      rushCount: rushJobs,
      lowStock: low.slice(0, 15),
      lowStockCount: low.length,
      materialCount,
      openTills,
      openRegister,
    },
    user
  );
});
