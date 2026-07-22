import './globals.css';
import ServiceWorker from '@/components/ServiceWorker';

export const metadata = {
  title: 'PrintPress — sales, stock & jobs',
  description: 'Point of sale, inventory and job tracking for a printing press.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'PrintPress' },
};

export const viewport = {
  themeColor: '#1d4ed8',
  width: 'device-width',
  initialScale: 1,
  // Staff need to pinch-zoom a receipt on a small screen.
  maximumScale: 5,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
