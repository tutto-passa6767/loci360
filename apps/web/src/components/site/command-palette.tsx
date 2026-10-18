'use client';

import clsx from 'clsx';
import { ArrowUpRight, CornerDownLeft, FileText, MapPin, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { apiFetch } from '@/lib/client-api';
import { dict, href } from '@/lib/i18n';
import type { Lang, LocationOption } from '@/lib/types';

const OPEN_EVENT = 'loci360:palette';

/** Opens the palette from anywhere (header button, mobile menu) */
export function openPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** Lower-case without accents, so "Sauran" finds "Sauran" and "алматы" finds "Алматы" */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ё/g, 'е');

type Item = { key: string; label: string; sub: string; path: string; kind: 'location' | 'page' };

/** Ctrl/⌘+K or "/" — jump to any location or section without leaving the keyboard */
export function CommandPalette({ lang }: { lang: Lang }) {
  const t = dict(lang);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const listId = useId();

  const { data } = useSWR(open ? ['palette', lang] : null, () => apiFetch<{ items: LocationOption[] }>(`/public/location-options?lang=${lang}`), {
    revalidateOnFocus: false,
  });

  useEffect(() => {
    const show = () => {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setQ('');
      setActive(0);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        show();
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_EVENT, show);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_EVENT, show);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const pages: Item[] = useMemo(
    () =>
      [
        ['/locations', t.nav.locations],
        ['/locations?view=map', t.nav.map],
        ['/shortlist', t.shortlist.title],
        ['/why-kazakhstan', t.nav.why],
        ['/incentives', t.nav.incentives],
        ['/permits', t.nav.permits],
        ['/services', t.nav.services],
        ['/request', t.nav.request],
      ].map(([path, label]) => ({ key: path, label, sub: '', path, kind: 'page' as const })),
    [t],
  );

  const results = useMemo(() => {
    const needle = norm(q.trim());
    const locations: Item[] = (data?.items ?? []).map((o) => ({
      key: o.slug,
      label: o.name,
      sub: [o.region, o.cluster].filter(Boolean).join(' · '),
      path: `/locations/${o.slug}`,
      kind: 'location',
    }));
    if (!needle) return [...locations.slice(0, 6), ...pages];
    const score = (it: Item) => {
      const name = norm(it.label);
      if (name.startsWith(needle)) return 3;
      if (name.split(/[\s—-]+/).some((w) => w.startsWith(needle))) return 2;
      if (norm(`${it.label} ${it.sub}`).includes(needle)) return 1;
      return 0;
    };
    return [...locations, ...pages]
      .map((it) => ({ it, s: score(it) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 10)
      .map((x) => x.it);
  }, [q, data, pages]);

  const close = () => {
    setOpen(false);
    returnFocus.current?.focus?.();
  };
  const go = (it: Item | undefined) => {
    if (!it) return;
    setOpen(false);
    router.push(href(lang, it.path));
  };

  if (!open) return null;
  const current = Math.min(active, Math.max(0, results.length - 1));

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/70 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-label={t.palette.open} className="glass w-full max-w-xl overflow-hidden rounded-3xl bg-[#0d0d0d]/90">
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-5">
          <Search className="size-4 shrink-0 text-white/50" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => (results.length ? (Math.min(i, results.length - 1) + 1) % results.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => (results.length ? (Math.min(i, results.length - 1) - 1 + results.length) % results.length : 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                go(results[current]);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
              }
            }}
            placeholder={t.palette.placeholder}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[current] ? `${listId}-${current}` : undefined}
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/40 focus-visible:outline-none"
          />
          <kbd className="rounded-md border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-white/50">Esc</kbd>
        </div>
        <ul id={listId} role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-4 py-6 text-center text-sm text-fg-muted">{t.palette.none}</li>}
          {results.map((it, i) => (
            <li key={it.kind + it.key} id={`${listId}-${i}`} role="option" aria-selected={i === current}>
              <button
                type="button"
                onMouseMove={() => setActive(i)}
                onClick={() => go(it)}
                className={clsx('flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors', i === current ? 'bg-accent-soft' : 'hover:bg-white/[0.04]')}
              >
                <span className={clsx('flex size-8 shrink-0 items-center justify-center rounded-xl border', i === current ? 'border-accent/50 text-accent-bright' : 'border-white/10 text-white/50')}>
                  {it.kind === 'location' ? <MapPin className="size-4" /> : <FileText className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white">{it.label}</span>
                  {it.sub && <span className="block truncate text-xs text-fg-subtle">{it.sub}</span>}
                </span>
                {i === current ? <CornerDownLeft className="size-4 text-white/50" /> : <ArrowUpRight className="size-4 text-white/20" />}
              </button>
            </li>
          ))}
        </ul>
        <p className="flex items-center gap-3 border-t border-white/[0.08] px-5 py-2.5 font-mono text-[10px] text-white/40">
          <span>↑↓</span>
          <span>↵ {t.palette.hint}</span>
          <span className="ml-auto">Ctrl K</span>
        </p>
      </div>
    </div>
  );
}
