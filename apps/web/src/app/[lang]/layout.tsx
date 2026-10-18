import type { Metadata, Viewport } from 'next';
import { Inter, Inter_Tight, JetBrains_Mono } from 'next/font/google';
import { notFound } from 'next/navigation';
import { Analytics } from '@/components/site/analytics';
import { Footer } from '@/components/site/footer';
import { Header } from '@/components/site/header';
import { api } from '@/lib/api';
import { href, isLang } from '@/lib/i18n';
import { SITE_URL } from '@/lib/site';
import type { Lang } from '@/lib/types';
import '../globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter', display: 'swap' });
const interTight = Inter_Tight({ subsets: ['latin', 'cyrillic'], variable: '--font-inter-tight', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin', 'cyrillic'], variable: '--font-mono-face', display: 'swap', weight: ['400', '500'] });

const NO_ANALYTICS = { ga4Id: null, metrikaId: null };

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
};

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const site = await api.site(lang).catch(() => null);
  const title = site?.seo.title ?? 'LOCI360';
  const description = site?.seo.description;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s — LOCI360` },
    description,
    applicationName: 'LOCI360',
    alternates: { canonical: href(lang, '/'), languages: { en: '/', ru: '/ru', 'x-default': '/' } },
    openGraph: {
      type: 'website',
      siteName: 'LOCI360',
      title,
      description,
      locale: lang === 'ru' ? 'ru_RU' : 'en_US',
      images: site?.seo.image ? [{ url: site.seo.image.url, width: site.seo.image.width, height: site.seo.image.height }] : undefined,
    },
    twitter: { card: 'summary_large_image' },
    icons: { icon: '/icon.svg' },
  };
}

export default async function LangLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const [site, taxonomy] = await Promise.all([api.site(lang as Lang).catch(() => null), api.taxonomy(lang as Lang).catch(() => null)]);
  return (
    <html lang={lang} className={`${inter.variable} ${interTight.variable} ${mono.variable}`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-black">
          Skip to content
        </a>
        <Header lang={lang as Lang} />
        <main id="main">{children}</main>
        <Footer lang={lang as Lang} site={site} clusters={taxonomy?.clusters ?? []} />
        <Analytics lang={lang as Lang} ids={site?.analytics ?? NO_ANALYTICS} />
      </body>
    </html>
  );
}
