import type { Metadata } from 'next';
import { Inter, Inter_Tight, JetBrains_Mono } from 'next/font/google';
import { AdminShell } from '@/components/admin/shell';
import '../globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter', display: 'swap' });
const interTight = Inter_Tight({ subsets: ['latin', 'cyrillic'], variable: '--font-inter-tight', display: 'swap', weight: ['500', '600', '700'] });
const mono = JetBrains_Mono({ subsets: ['latin', 'cyrillic'], variable: '--font-mono-face', display: 'swap', weight: ['400', '500'] });

export const metadata: Metadata = {
  title: { default: 'CMS', template: '%s — LOCI360 CMS' },
  robots: { index: false, follow: false },
  icons: { icon: '/icon.svg' },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${inter.variable} ${interTight.variable} ${mono.variable}`}>
      <body>
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
