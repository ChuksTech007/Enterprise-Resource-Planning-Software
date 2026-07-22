'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useApp } from './AppProvider';
import { apiPost } from '@/lib/client';
import { Modal } from './ui';

/* The five things a cashier touches all day live in the bottom bar.
 * Everything else is one tap away behind "More". */
const PRIMARY = [
  { href: '/', label: 'Home', icon: '⌂' },
  { href: '/sales/new', label: 'New sale', icon: '＋' },
  { href: '/jobs', label: 'Jobs', icon: '🖨' },
  { href: '/debts', label: 'Owing', icon: '⏳' },
];

const ALL_LINKS = [
  { href: '/', label: 'Dashboard', group: 'Daily' },
  { href: '/sales/new', label: 'New sale', group: 'Daily' },
  { href: '/jobs', label: 'Jobs & quotes', group: 'Daily' },
  { href: '/sales', label: 'Sales & invoices', group: 'Daily' },
  { href: '/debts', label: 'Who owes me', group: 'Daily' },
  { href: '/register', label: 'Cash-up', group: 'Daily' },

  { href: '/customers', label: 'Customers', group: 'Records' },
  { href: '/inventory', label: 'Stock', group: 'Records' },
  { href: '/inventory/movements', label: 'Stock movements', group: 'Records' },
  { href: '/pricelist', label: 'Price list', group: 'Records' },

  { href: '/reports', label: 'Reports', group: 'Owner', ownerOnly: true },
  { href: '/expenses', label: 'Expenses', group: 'Owner', ownerOnly: true },

  { href: '/accounting', label: 'Accounts', group: 'Finance', ownerOnly: true },
  { href: '/purchases', label: 'Purchase orders', group: 'Finance', ownerOnly: true },
  { href: '/payables', label: 'What I owe', group: 'Finance', ownerOnly: true },
  { href: '/assets', label: 'Equipment', group: 'Finance', ownerOnly: true },
  { href: '/suppliers', label: 'Suppliers', group: 'Owner', ownerOnly: true },
  { href: '/staff', label: 'Staff', group: 'Owner', ownerOnly: true },
  { href: '/audit', label: 'Activity log', group: 'Owner', ownerOnly: true },
  { href: '/settings', label: 'Settings', group: 'Owner', ownerOnly: true },
];

export default function Shell({ children }) {
  const { user, isOwner, settings, online, pending, sync } = useApp();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const router = useRouter();

  const links = ALL_LINKS.filter((l) => !l.ownerOnly || isOwner);
  const groups = [...new Set(links.map((l) => l.group))];

  const isActive = (href) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  async function signOut() {
    await apiPost('/api/auth/logout', {}, { queue: false }).catch(() => {});
    router.push('/login');
  }

  return (
    <div className="min-h-dvh">
      {/* ---------------- desktop sidebar ---------------- */}
      <aside className="no-print fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <div className="border-b border-line px-4 py-4">
          <p className="truncate font-bold text-ink">{settings?.businessName || 'Printing Press'}</p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {user?.name} · {isOwner ? 'Owner' : 'Cashier'}
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {groups.map((g) => (
            <div key={g} className="mb-3">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{g}</p>
              {links
                .filter((l) => l.group === g)
                .map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                      isActive(l.href) ? 'bg-brand-soft text-brand-ink' : 'text-muted hover:bg-page hover:text-ink'
                    }`}
                  >
                    {l.label}
                  </Link>
                ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <button onClick={signOut} className="btn-secondary btn-sm w-full">
            Sign out
          </button>
        </div>
      </aside>

      {/* ---------------- mobile header ---------------- */}
      <header className="no-print sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{settings?.businessName || 'Printing Press'}</p>
            <p className="truncate text-xs text-muted">
              {user?.name} · {isOwner ? 'Owner' : 'Cashier'}
            </p>
          </div>
          <button onClick={() => setMoreOpen(true)} className="btn-secondary btn-sm">
            Menu
          </button>
        </div>
      </header>

      <ConnectionBar online={online} pending={pending} onSync={sync} />

      <main className="px-4 pb-28 pt-4 lg:ml-60 lg:px-8 lg:pb-10">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>

      {/* ---------------- mobile bottom bar ---------------- */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface lg:hidden">
        <div className="flex items-stretch">
          {PRIMARY.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                isActive(l.href) ? 'text-brand' : 'text-muted'
              }`}
            >
              <span className="text-lg leading-none">{l.icon}</span>
              {l.label}
            </Link>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-muted"
          >
            <span className="text-lg leading-none">☰</span>
            More
          </button>
        </div>
        {/* Keeps the bar clear of the iPhone home indicator. */}
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Menu">
        {groups.map((g) => (
          <div key={g} className="mb-4">
            <p className="pb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{g}</p>
            <div className="grid grid-cols-2 gap-2">
              {links
                .filter((l) => l.group === g)
                .map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setMoreOpen(false)}
                    className={`rounded-lg border px-3 py-3 text-sm font-medium ${
                      isActive(l.href) ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line text-ink'
                    }`}
                  >
                    {l.label}
                  </Link>
                ))}
            </div>
          </div>
        ))}
        <button onClick={signOut} className="btn-secondary mt-2 w-full">
          Sign out
        </button>
      </Modal>
    </div>
  );
}

/**
 * The honesty bar. Staff need to know, at a glance, whether what they just
 * typed has actually reached the server — otherwise "I entered it" and "it is
 * saved" drift apart and nobody trusts the totals.
 */
function ConnectionBar({ online, pending, onSync }) {
  if (online && !pending) return null;

  return (
    <div
      className={`no-print sticky top-0 z-20 px-4 py-2 text-center text-sm font-medium lg:ml-60 ${
        online ? 'bg-warn-soft text-warn' : 'bg-bad-soft text-bad'
      }`}
    >
      {!online ? (
        <>
          No network — you can keep working.{' '}
          {pending > 0 && <span className="font-semibold">{pending} saved on this device.</span>}
        </>
      ) : (
        <button onClick={onSync} className="underline underline-offset-2">
          {pending} entr{pending === 1 ? 'y' : 'ies'} waiting to sync — tap to send now
        </button>
      )}
    </div>
  );
}
