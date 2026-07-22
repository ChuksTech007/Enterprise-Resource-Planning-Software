import { route } from '@/lib/http';
import { debtorList } from '@/lib/reports';

export const dynamic = 'force-dynamic';

// Cashiers need this too — they are the ones who collect the balance when the
// customer walks back in. It carries no cost or margin data.
export const GET = route(async () => {
  const data = await debtorList();
  return data;
});
