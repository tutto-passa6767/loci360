'use client';

import clsx from 'clsx';
import { Check, Search, SlidersHorizontal, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { ACCESS, accessLabel, dict, href, SEASONS, seasonLabel } from '@/lib/i18n';
import { LIST_KEYS, type ListKey } from '@/lib/filters';
import type { Lang, Taxonomy } from '@/lib/types';


const AIRPORT_STEPS = [50, 100, 200, 300];

function useFilterNav(lang: Lang) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const base = href(lang, '/locations');

  const go = (mutate: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    next.delete('page');
    const s = next.toString();
    start(() => router.push(s ? `${base}?${s}` : base, { scroll: false }));
  };
  const list = (key: ListKey) => (params.get(key) ?? '').split(',').filter(Boolean);
  const toggle = (key: ListKey, value: string) =>
    go((p) => {
      const cur = new Set(list(key));
      if (cur.has(value)) cur.delete(value);
      else cur.add(value);
      if (cur.size) p.set(key, [...cur].join(','));
      else p.delete(key);
    });
  return { params, pending, go, list, toggle, base };
}

function Group({ title, children, count }: { title: string; children: React.ReactNode; count?: number }) {
  return (
    <fieldset className="border-t border-border py-5 first:border-t-0 first:pt-0">
      <legend className="mb-3 flex w-full items-center justify-between text-[13px] font-semibold text-white">
        {title}
        {!!count && <span className="rounded-full bg-accent px-1.5 font-mono text-[10px] leading-4 text-white">{count}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

function Option({ checked, onChange, label, count }: { checked: boolean; onChange: () => void; label: string; count?: number }) {
  return (
    <label className={clsx('flex cursor-pointer items-center gap-2.5 rounded-lg py-1.5 text-sm transition-colors', count === 0 && !checked ? 'text-fg-subtle' : 'text-fg-muted hover:text-white')}>
      <span
        className={clsx(
          'flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors',
          checked ? 'border-accent bg-accent' : 'border-border-strong bg-bg-2',
        )}
      >
        {checked && <Check className="size-3 text-white" strokeWidth={3} />}
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="font-mono text-[11px] text-fg-subtle">{count}</span>}
    </label>
  );
}

function FilterPanel({ lang, taxonomy }: { lang: Lang; taxonomy: Taxonomy }) {
  const t = dict(lang).catalogue;
  const { params, go, list, toggle } = useFilterNav(lang);
  const airport = Number(params.get('airportKm') || 0);
  const groups: { key: ListKey; title: string; items: { value: string; label: string; count: number }[] }[] = [
    { key: 'genre', title: t.genres, items: taxonomy.genres.map((g) => ({ value: g.slug, label: g.label, count: g.count })) },
    { key: 'landscape', title: t.landscapes, items: taxonomy.landscapes.map((g) => ({ value: g.slug, label: g.label, count: g.count })) },
    { key: 'cluster', title: t.clusters, items: taxonomy.clusters.map((c) => ({ value: c.slug, label: `${c.name} · ${c.tagline}`, count: c.count })) },
    { key: 'season', title: t.seasons, items: SEASONS.map((s) => ({ value: s, label: seasonLabel(lang, s), count: taxonomy.seasons.find((x) => x.value === s)?.count ?? 0 })) },
    { key: 'era', title: t.eras, items: taxonomy.eras.map((g) => ({ value: g.slug, label: g.label, count: g.count })) },
  ];

  return (
    <div>
      {groups.map((g) => {
        const selected = list(g.key);
        return (
          <Group key={g.key} title={g.title} count={selected.length}>
            <div className="space-y-0.5">
              {g.items.map((i) => (
                <Option key={i.value} checked={selected.includes(i.value)} onChange={() => toggle(g.key, i.value)} label={i.label} count={i.count} />
              ))}
            </div>
          </Group>
        );
      })}
      <Group title={t.logistics} count={list('access').length + (airport ? 1 : 0) + (params.get('drone') ? 1 : 0)}>
        <p className="mb-2 text-xs text-fg-subtle">{t.access}</p>
        <div className="space-y-0.5">
          {ACCESS.map((a) => (
            <Option
              key={a}
              checked={list('access').includes(a)}
              onChange={() => toggle('access', a)}
              label={accessLabel(lang, a)}
              count={taxonomy.access.find((x) => x.value === a)?.count}
            />
          ))}
        </div>
        <p className="mt-4 mb-2 text-xs text-fg-subtle">{t.airport}</p>
        <div className="flex flex-wrap gap-1.5">
          {[0, ...AIRPORT_STEPS].map((km) => (
            <button
              key={km}
              type="button"
              onClick={() => go((p) => (km ? p.set('airportKm', String(km)) : p.delete('airportKm')))}
              className={clsx('rounded-full border px-3 py-1.5 text-xs font-medium transition-colors', airport === km ? 'border-accent bg-accent text-white' : 'border-border-strong text-fg-muted hover:text-white')}
            >
              {km ? t.withinKm(km) : t.anyDistance}
            </button>
          ))}
        </div>
        <div className="mt-4">
          <Option checked={!!params.get('drone')} onChange={() => go((p) => (p.get('drone') ? p.delete('drone') : p.set('drone', '1')))} label={t.droneFriendly} />
        </div>
      </Group>
    </div>
  );
}

/** Desktop sidebar + mobile drawer with the same filters */
export function Filters({ lang, taxonomy, total }: { lang: Lang; taxonomy: Taxonomy; total: number }) {
  const t = dict(lang).catalogue;
  const [open, setOpen] = useState(false);
  const { params, go, pending } = useFilterNav(lang);
  const active = LIST_KEYS.reduce((n, k) => n + (params.get(k)?.split(',').filter(Boolean).length ?? 0), 0) + (params.get('airportKm') ? 1 : 0) + (params.get('drone') ? 1 : 0);
  const reset = () => go((p) => [...LIST_KEYS, 'airportKm', 'drone', 'q'].forEach((k) => p.delete(k)));

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <aside className={clsx('hidden w-[280px] shrink-0 lg:block', pending && 'opacity-70')}>
        <div className="sticky top-[calc(var(--header-h)+24px)] max-h-[calc(100vh-var(--header-h)-48px)] overflow-y-auto pr-3 pb-8">
          <div className="mb-5 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">{t.filters}</p>
            {active > 0 && (
              <button type="button" onClick={reset} className="text-xs text-accent-bright hover:text-white">
                {t.reset}
              </button>
            )}
          </div>
          <FilterPanel lang={lang} taxonomy={taxonomy} />
        </div>
      </aside>

      <button type="button" onClick={() => setOpen(true)} className="btn-ghost btn-sm self-start lg:hidden">
        <SlidersHorizontal className="size-4" />
        {t.filters}
        {active > 0 && <span className="rounded-full bg-accent px-1.5 font-mono text-[10px] leading-4 text-white">{active}</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label={t.filters}>
          <div className="absolute inset-0 bg-[var(--overlay)]" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-bg shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-border px-5">
              <p className="font-semibold text-white">{t.filters}</p>
              <button type="button" onClick={() => setOpen(false)} className="flex size-9 items-center justify-center rounded-full hover:bg-white/10" aria-label={dict(lang).nav.close}>
                <X className="size-5" />
              </button>
            </div>
            <div className={clsx('flex-1 overflow-y-auto px-5 py-5', pending && 'opacity-70')}>
              <FilterPanel lang={lang} taxonomy={taxonomy} />
            </div>
            <div className="flex gap-2 border-t border-border p-4">
              <button type="button" onClick={reset} className="btn-ghost flex-1">
                {t.reset}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="btn-primary flex-[2]">
                {t.showResults(total)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Search field that updates the URL as you type (debounced) */
export function SearchBox({ lang }: { lang: Lang }) {
  const t = dict(lang).catalogue;
  const { params, go } = useFilterNav(lang);
  const [q, setQ] = useState(params.get('q') ?? '');
  const urlQ = params.get('q') ?? '';

  useEffect(() => {
    if (q.trim() === urlQ) return;
    const id = setTimeout(() => go((p) => (q.trim() ? p.set('q', q.trim()) : p.delete('q'))), 450);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <label className="relative block flex-1 sm:max-w-md">
      <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-fg-subtle" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} aria-label={t.search} className="input rounded-full pl-11" type="search" />
    </label>
  );
}

export function SortSelect({ lang, value }: { lang: Lang; value: string }) {
  const t = dict(lang).catalogue;
  const { go } = useFilterNav(lang);
  return (
    <select
      value={value}
      onChange={(e) => go((p) => (e.target.value === 'featured' ? p.delete('sort') : p.set('sort', e.target.value)))}
      aria-label={t.sort}
      className="input h-10 w-auto rounded-full text-[13px]"
    >
      {Object.entries(t.sorts).map(([k, label]) => (
        <option key={k} value={k}>
          {label}
        </option>
      ))}
    </select>
  );
}
