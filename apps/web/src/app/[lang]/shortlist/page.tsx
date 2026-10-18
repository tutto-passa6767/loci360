import type { Metadata } from 'next';
import { ShortlistView } from '@/components/shortlist/shortlist-view';
import { dict, href } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = (await params).lang as Lang;
  // Personal lists: nothing here for search engines
  return { title: dict(lang).shortlist.title, robots: { index: false }, alternates: { canonical: href(lang, '/shortlist') } };
}

export default async function ShortlistPage({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<{ l?: string | string[] }> }) {
  const lang = (await params).lang as Lang;
  const raw = (await searchParams).l;
  const shared = typeof raw === 'string' ? [...new Set(raw.split(',').filter((s) => /^[a-z0-9-]{1,80}$/.test(s)))].slice(0, 24) : null;
  return <ShortlistView lang={lang} shared={shared?.length ? shared : null} />;
}
