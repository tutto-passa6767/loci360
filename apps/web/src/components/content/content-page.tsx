import { ArrowUpRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Headline } from '@/components/site/headline';
import { api } from '@/lib/api';
import { dict, href } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

/** Metadata for an editorial page managed in the CMS */
export async function pageMetadata(lang: Lang, slug: string, path: string): Promise<Metadata> {
  const p = await api.page(lang, slug);
  return {
    title: p.seo.title,
    description: p.seo.description ?? undefined,
    alternates: { canonical: href(lang, path), languages: { en: path, ru: `/ru${path}` } },
    openGraph: p.seo.image ? { images: [{ url: p.seo.image.url, width: p.seo.image.width, height: p.seo.image.height }] } : undefined,
  };
}

/**
 * Editorial page: title, lead and a Markdown body edited in the CMS.
 * Markdown is rendered without raw HTML, so page content cannot inject scripts.
 */
export async function ContentPage({ lang, slug, eyebrow, aside }: { lang: Lang; slug: string; eyebrow: string; aside?: React.ReactNode }) {
  const page = await api.page(lang, slug);
  const t = dict(lang);
  return (
    <div className="pt-[var(--header-h)]">
      <header className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_120%_at_100%_0%,rgba(230,30,50,.28),transparent_60%)]" />
        <div className="container-x relative py-16 sm:py-24">
          <p className="tag">{eyebrow}</p>
          <Headline as="h1" text={page.title} className="mt-5 max-w-4xl text-5xl leading-[1.02] text-white sm:text-7xl" />
          {page.lead && <p className="mt-6 max-w-2xl text-lg leading-relaxed text-fg-muted sm:text-xl">{page.lead}</p>}
        </div>
      </header>
      <div className="container-x grid gap-12 py-14 lg:grid-cols-[1fr_320px] lg:gap-20">
        <div className="prose-loci">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{page.body}</ReactMarkdown>
        </div>
        <aside className="space-y-4 lg:pt-14">
          {aside}
          <div className="card sticky top-[calc(var(--header-h)+24px)] p-6">
            <p className="font-display text-xl font-normal tracking-[-0.02em] text-white">{t.home.ctaTitle}</p>
            <p className="mt-2 text-sm text-fg-muted">{t.home.ctaText}</p>
            <Link href={href(lang, '/request')} className="group btn-primary mt-5 w-full justify-between pr-1.5 pl-5">
              {t.nav.request}
              <span className="btn-dot">
                <ArrowUpRight className="size-4" />
              </span>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
