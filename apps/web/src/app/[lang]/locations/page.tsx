import clsx from 'clsx';
import { LayoutGrid, List, Map as MapIcon, X } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Filters, SearchBox, SortSelect } from '@/components/catalogue/filters';
import { LocationCard } from '@/components/catalogue/location-card';
import { LocationMap } from '@/components/map/location-map';
import { api } from '@/lib/api';
import { LIST_KEYS } from '@/lib/filters';
import { accessLabel, dict, href, seasonLabel } from '@/lib/i18n';
import type { Lang, Season, HeavyAccess } from '@/lib/types';

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const FILTER_KEYS = [...LIST_KEYS, 'airportKm', 'drone', 'q', 'sort'] as const;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = (await params).lang as Lang;
  const t = dict(lang).catalogue;
  return {
    title: t.title,
    alternates: { canonical: href(lang, '/locations'), languages: { en: '/locations', ru: '/ru/locations' } },
  };
}

export default async function LocationsPage({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<Search> }) {
  const lang = (await params).lang as Lang;
  const sp = await searchParams;
  const t = dict(lang).catalogue;
  const view = one(sp.view) === 'map' ? 'map' : one(sp.view) === 'list' ? 'list' : 'grid';
  const filters: Record<string, string | undefined> = Object.fromEntries(FILTER_KEYS.map((k) => [k, one(sp[k])]));
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const [taxonomy, result, map] = await Promise.all([
    api.taxonomy(lang),
    view === 'map' ? null : api.locations(lang, { ...filters, page: String(page), limit: '24' }),
    view === 'map' ? api.map(lang, filters) : null,
  ]);
  const total = result?.total ?? map?.points.length ?? 0;

  /** Same URL with one parameter changed */
  const urlWith = (changes: Record<string, string | null>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const val = one(v);
      if (val) s.set(k, val);
    }
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) s.delete(k);
      else s.set(k, v);
    }
    const q = s.toString();
    return href(lang, `/locations${q ? `?${q}` : ''}`);
  };

  // Active filters as removable chips
  const labelFor = (key: string, value: string): string => {
    const find = (list: { slug: string; label?: string; name?: string }[]) => list.find((x) => x.slug === value);
    switch (key) {
      case 'genre':
        return find(taxonomy.genres)?.label ?? value;
      case 'landscape':
        return find(taxonomy.landscapes)?.label ?? value;
      case 'era':
        return find(taxonomy.eras)?.label ?? value;
      case 'tag':
        return find(taxonomy.tags)?.label ?? value;
      case 'cluster':
        return find(taxonomy.clusters)?.name ?? value;
      case 'season':
        return seasonLabel(lang, value as Season);
      case 'access':
        return accessLabel(lang, value as HeavyAccess);
      default:
        return value;
    }
  };
  const chips: { label: string; url: string }[] = [];
  for (const key of LIST_KEYS) {
    const values = (filters[key] ?? '').split(',').filter(Boolean);
    for (const v of values) {
      const rest = values.filter((x) => x !== v);
      chips.push({ label: labelFor(key, v), url: urlWith({ [key]: rest.length ? rest.join(',') : null, page: null }) });
    }
  }
  if (filters.airportKm) chips.push({ label: t.withinKm(Number(filters.airportKm)), url: urlWith({ airportKm: null, page: null }) });
  if (filters.drone) chips.push({ label: t.droneFriendly, url: urlWith({ drone: null, page: null }) });
  if (filters.q) chips.push({ label: `“${filters.q}”`, url: urlWith({ q: null, page: null }) });

  const views = [
    { key: 'grid', label: t.grid, icon: LayoutGrid },
    { key: 'list', label: t.list, icon: List },
    { key: 'map', label: t.map, icon: MapIcon },
  ] as const;

  return (
    <div className="pt-[var(--header-h)]">
      <section className="border-b border-border bg-bg-2">
        <div className="container-x py-10 sm:py-14">
          <p className="tag">{t.eyebrow}</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <h1 className="display text-4xl text-white sm:text-6xl">{t.title}</h1>
            <p className="font-mono text-sm text-fg-muted">{t.results(total)}</p>
          </div>
        </div>
      </section>

      <div className="container-x flex flex-col gap-6 py-8 lg:flex-row lg:gap-10">
        <Suspense>
          <Filters lang={lang} taxonomy={taxonomy} total={total} />
        </Suspense>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <Suspense>
              <SearchBox lang={lang} />
            </Suspense>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {view !== 'map' && (
                <Suspense>
                  <SortSelect lang={lang} value={filters.sort ?? 'featured'} />
                </Suspense>
              )}
              <div className="flex rounded-full border border-border-strong p-1" role="group" aria-label="View">
                {views.map((v) => (
                  <Link
                    key={v.key}
                    href={urlWith({ view: v.key === 'grid' ? null : v.key, page: null })}
                    aria-current={view === v.key ? 'page' : undefined}
                    scroll={false}
                    className={clsx(
                      'flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors',
                      view === v.key ? 'bg-white text-black' : 'text-fg-muted hover:text-white',
                    )}
                  >
                    <v.icon className="size-4" />
                    <span className="hidden sm:inline">{v.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {chips.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <Link key={c.url + c.label} href={c.url} scroll={false} className="chip border-accent/50 bg-accent-soft text-white hover:border-accent-bright">
                  {c.label}
                  <X className="size-3" />
                </Link>
              ))}
              <Link href={href(lang, `/locations${view === 'grid' ? '' : `?view=${view}`}`)} scroll={false} className="text-xs text-accent-bright hover:text-white">
                {t.resetAll}
              </Link>
            </div>
          )}

          <div className="mt-6">
            {view === 'map' && map ? (
              <LocationMap lang={lang} points={map.points} fit openLabel={t.open} className="h-[calc(100vh-var(--header-h)-180px)] min-h-[520px] rounded-3xl border border-border" />
            ) : result && result.items.length > 0 ? (
              <>
                <div className={clsx('grid gap-5', view === 'grid' ? 'sm:grid-cols-2 2xl:grid-cols-3' : 'grid-cols-1')}>
                  {result.items.map((item, i) => (
                    <LocationCard key={item.id} lang={lang} item={item} layout={view === 'list' ? 'list' : 'grid'} priority={i < 2} />
                  ))}
                </div>
                {result.pages > 1 && (
                  <nav className="mt-10 flex items-center justify-center gap-2" aria-label={t.page}>
                    {page > 1 && (
                      <Link href={urlWith({ page: String(page - 1) })} className="btn-ghost btn-sm">
                        {t.prev}
                      </Link>
                    )}
                    {Array.from({ length: result.pages }, (_, i) => i + 1).map((n) => (
                      <Link
                        key={n}
                        href={urlWith({ page: n === 1 ? null : String(n) })}
                        aria-current={n === page ? 'page' : undefined}
                        className={clsx('flex size-9 items-center justify-center rounded-full font-mono text-sm', n === page ? 'bg-white text-black' : 'text-fg-muted hover:bg-white/10')}
                      >
                        {n}
                      </Link>
                    ))}
                    {page < result.pages && (
                      <Link href={urlWith({ page: String(page + 1) })} className="btn-ghost btn-sm">
                        {t.next}
                      </Link>
                    )}
                  </nav>
                )}
              </>
            ) : (
              <div className="card flex flex-col items-start gap-4 p-10">
                <h2 className="display text-2xl text-white">{t.empty}</h2>
                <p className="max-w-md text-fg-muted">{t.emptyText}</p>
                <div className="flex flex-wrap gap-2">
                  <Link href={href(lang, '/locations')} className="btn-light btn-sm">
                    {t.resetAll}
                  </Link>
                  <Link href={href(lang, '/request')} className="btn-ghost btn-sm">
                    {dict(lang).nav.request}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
