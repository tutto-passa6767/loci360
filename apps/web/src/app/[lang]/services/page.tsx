import clsx from 'clsx';
import { Globe, Mail, MapPin, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Headline } from '@/components/site/headline';
import { api } from '@/lib/api';
import { dict, href, serviceCategoryLabel } from '@/lib/i18n';
import type { Lang, ServiceCategory } from '@/lib/types';

const CATEGORIES: ServiceCategory[] = ['PRODUCTION_SERVICES', 'RENTAL', 'CATERING', 'CAST', 'TRANSPORT', 'ACCOMMODATION'];

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = (await params).lang as Lang;
  const t = dict(lang).services;
  return { title: t.title, description: t.text, alternates: { canonical: href(lang, '/services'), languages: { en: '/services', ru: '/ru/services' } } };
}

export default async function ServicesPage({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<{ category?: string }> }) {
  const lang = (await params).lang as Lang;
  const raw = (await searchParams).category;
  const category = CATEGORIES.find((c) => c === raw);
  const t = dict(lang).services;
  const { items } = await api.services(lang);
  const present = CATEGORIES.filter((c) => items.some((i) => i.category === c));
  const shown = category ? items.filter((i) => i.category === category) : items;

  return (
    <div className="pt-[var(--header-h)]">
      <header className="border-b border-border bg-bg-2">
        <div className="container-x py-14 sm:py-20">
          <p className="tag">{t.eyebrow}</p>
          <Headline as="h1" text={t.title} className="mt-5 text-5xl leading-[1.02] text-white sm:text-7xl" />
          <p className="mt-5 max-w-2xl text-lg text-fg-muted">{t.text}</p>
        </div>
      </header>
      <div className="container-x py-10">
        <nav className="flex flex-wrap gap-2" aria-label={t.title}>
          {[undefined, ...present].map((c) => (
            <Link
              key={c ?? 'all'}
              href={href(lang, c ? `/services?category=${c}` : '/services')}
              scroll={false}
              aria-current={category === c ? 'page' : undefined}
              className={clsx(
                'rounded-full border px-4 py-2 text-[13px] font-medium transition-colors',
                category === c
                  ? 'border-accent bg-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_6px_20px_var(--accent-glow)]'
                  : 'border-white/10 bg-white/[0.03] text-fg-muted hover:border-white/20 hover:text-white',
              )}
            >
              {c ? serviceCategoryLabel(lang, c) : t.all}
            </Link>
          ))}
        </nav>
        {shown.length === 0 ? (
          <p className="mt-10 text-fg-muted">{t.empty}</p>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((s) => (
              <article key={s.id} className="card flex flex-col p-6">
                <div className="flex items-start gap-4">
                  {s.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.logo} alt="" className="size-12 shrink-0 rounded-xl bg-white object-contain p-1.5" loading="lazy" />
                  ) : (
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft font-display text-lg font-bold text-accent-bright">{s.name.slice(0, 1)}</span>
                  )}
                  <div className="min-w-0">
                    <p className="eyebrow">{serviceCategoryLabel(lang, s.category)}</p>
                    <h2 className="mt-1 font-display text-xl leading-snug font-normal tracking-[-0.02em] text-white">{s.name}</h2>
                  </div>
                </div>
                {s.description && <p className="mt-4 text-sm leading-relaxed text-fg-muted">{s.description}</p>}
                <ul className="mt-auto space-y-1.5 pt-5 text-sm text-fg-muted">
                  <li className="flex items-center gap-2">
                    <MapPin className="size-4 text-accent-bright" /> {s.city}
                  </li>
                  {s.website && (
                    <li className="flex items-center gap-2">
                      <Globe className="size-4 text-accent-bright" />
                      <a href={s.website} target="_blank" rel="noopener noreferrer" className="truncate hover:text-white">
                        {s.website.replace(/^https?:\/\//, '')}
                      </a>
                    </li>
                  )}
                  {s.email && (
                    <li className="flex items-center gap-2">
                      <Mail className="size-4 text-accent-bright" />
                      <a href={`mailto:${s.email}`} className="hover:text-white">
                        {s.email}
                      </a>
                    </li>
                  )}
                  {s.phone && (
                    <li className="flex items-center gap-2">
                      <Phone className="size-4 text-accent-bright" />
                      <a href={`tel:${s.phone.replace(/[^\d+]/g, '')}`} className="hover:text-white">
                        {s.phone}
                      </a>
                    </li>
                  )}
                </ul>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
