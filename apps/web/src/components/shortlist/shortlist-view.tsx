'use client';

import { ArrowUpRight, Bookmark, Check, Download, Link2, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import useSWR from 'swr';
import { Picture } from '@/components/media/picture';
import { Headline } from '@/components/site/headline';
import { apiFetch } from '@/lib/client-api';
import { accessLabel, connectivityLabel, coord, dict, droneLabel, href, num, powerLabel, seasonLabel } from '@/lib/i18n';
import { useShortlist } from '@/lib/shortlist';
import type { Lang, LocationDetail } from '@/lib/types';

const noop = () => () => {};

/** The visitor's shortlist (or one shared by link): cards, a side-by-side comparison and one request for all */
export function ShortlistView({ lang, shared }: { lang: Lang; shared: string[] | null }) {
  const t = dict(lang).shortlist;
  const tl = dict(lang).location;
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const { list, remove, clear, addMany } = useShortlist();
  const [copied, setCopied] = useState(false);
  const slugs = shared ?? list;

  const { data, isLoading } = useSWR(slugs.length ? ['shortlist', lang, slugs.join(',')] : null, () =>
    Promise.all(slugs.map((s) => apiFetch<LocationDetail>(`/public/locations/${s}?lang=${lang}`).catch(() => null))),
  );
  const items = (data ?? []).filter((x): x is LocationDetail => x !== null);

  const share = async () => {
    const url = `${window.location.origin}${href(lang, '/shortlist')}?l=${slugs.join(',')}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt(t.share, url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const km = (v: number | null | undefined) => (v != null ? `${num(lang, v)} ${tl.km}` : '—');
  const rows: { label: string; value: (l: LocationDetail) => string }[] = [
    { label: tl.gps, value: (l) => `${coord(l.spec.lat, 'N', 'S')} ${coord(l.spec.lng, 'E', 'W')}` },
    { label: tl.elevation, value: (l) => (l.spec.elevationM != null ? `${num(lang, l.spec.elevationM)} ${tl.m}` : '—') },
    { label: tl.airport, value: (l) => (l.spec.airport ? `${l.spec.airport.code ?? l.spec.airport.name ?? ''} · ${km(l.spec.airport.km)}` : '—') },
    { label: tl.driveTime, value: (l) => (l.spec.driveHours != null ? `${num(lang, l.spec.driveHours)} ${tl.h}` : '—') },
    { label: tl.heavyAccess, value: (l) => accessLabel(lang, l.spec.heavyAccess) },
    { label: tl.connectivity, value: (l) => connectivityLabel(lang, l.spec.connectivity) },
    { label: tl.power, value: (l) => powerLabel(lang, l.spec.power) },
    { label: tl.drone, value: (l) => droneLabel(lang, l.spec.drone) },
    { label: tl.nationalPark, value: (l) => (l.spec.nationalPark ? tl.yes : tl.no) },
    { label: tl.borderZone, value: (l) => (l.spec.borderZone ? tl.yes : tl.no) },
    { label: tl.seasons, value: (l) => l.spec.seasons.map((s) => seasonLabel(lang, s)).join(', ') || '—' },
  ];

  return (
    <div className="pt-[var(--header-h)]">
      <header className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_100%_0%,rgba(230,30,50,.22),transparent_60%)]" />
        <div className="container-x relative py-14 sm:py-20">
          <p className="tag">{shared ? t.shared : t.eyebrow}</p>
          <Headline as="h1" text={t.heading} className="mt-5 max-w-4xl text-5xl leading-[1.02] text-white sm:text-7xl" />
          <p className="mt-5 max-w-2xl text-lg text-fg-muted">{shared ? t.sharedText : t.text}</p>
          {mounted && slugs.length > 0 && (
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={href(lang, `/request?locations=${slugs.join(',')}`)} className="group btn-primary h-12 pr-2 pl-6">
                {t.requestAll(slugs.length)}
                <span className="btn-dot ml-1">
                  <ArrowUpRight className="size-4" />
                </span>
              </Link>
              <a
                href={`/api/public/shortlist.pdf?l=${slugs.slice(0, 12).join(',')}&lang=${lang}`}
                download
                title={t.pdfTitle}
                className="btn-ghost h-12 px-6"
              >
                <Download className="size-4" /> {t.pdf}
              </a>
              {shared ? (
                <button type="button" className="btn-ghost h-12 px-6" onClick={() => addMany(shared)}>
                  <Bookmark className="size-4" /> {t.keep}
                </button>
              ) : (
                <>
                  <button type="button" className="btn-ghost h-12 px-6" onClick={share}>
                    {copied ? <Check className="size-4 text-success" /> : <Link2 className="size-4" />}
                    {copied ? t.copied : t.share}
                  </button>
                  <button type="button" className="btn h-12 px-4 text-fg-muted hover:text-white" onClick={clear}>
                    <Trash2 className="size-4" /> {t.clear}
                  </button>
                </>
              )}
              <span className="font-mono text-xs text-fg-subtle">{t.count(slugs.length)}</span>
            </div>
          )}
        </div>
      </header>

      <div className="container-x py-12 sm:py-16">
        {!mounted || (slugs.length > 0 && isLoading) ? (
          <p className="text-fg-muted">{t.loading}</p>
        ) : items.length === 0 ? (
          <div className="card flex flex-col items-start gap-4 p-10">
            <Bookmark className="size-8 text-accent-bright" />
            <h2 className="display text-3xl text-white">{t.empty}</h2>
            <p className="max-w-md text-fg-muted">{t.emptyText}</p>
            <Link href={href(lang, '/locations')} className="btn-primary mt-2">
              {t.browse}
            </Link>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((l) => (
                <article key={l.slug} className="card group relative flex flex-col overflow-hidden p-2">
                  <div className="relative aspect-[16/10] overflow-hidden rounded-[18px] bg-bg-2">
                    <Picture image={l.cover} sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 100vw" className="absolute inset-0 size-full transition-transform duration-700 group-hover:scale-[1.04]" />
                    {!shared && (
                      <button
                        type="button"
                        onClick={() => remove(l.slug)}
                        aria-label={`${t.remove}: ${l.name}`}
                        className="absolute top-3 right-3 z-10 flex size-9 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white backdrop-blur transition-colors hover:border-accent hover:bg-accent"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 px-3 pt-4 pb-3">
                    <h2 className="font-display text-xl leading-snug tracking-[-0.02em] text-white">
                      <Link href={href(lang, `/locations/${l.slug}`)} className="after:absolute after:inset-0 after:content-['']">
                        {l.name}
                      </Link>
                    </h2>
                    <p className="text-[13px] text-fg-subtle">{[l.region, l.cluster?.name].filter(Boolean).join(' · ')}</p>
                    <p className="line-clamp-2 text-sm leading-relaxed text-fg-muted">{l.summary}</p>
                    <a
                      href={`/api/public/locations/${l.slug}/spec-sheet.pdf?lang=${lang}`}
                      download
                      className="relative z-10 mt-auto inline-flex items-center gap-1.5 self-start pt-2 text-xs font-semibold text-accent-bright hover:text-white"
                    >
                      <Download className="size-3.5" /> PDF
                    </a>
                  </div>
                </article>
              ))}
            </div>

            {items.length > 1 && (
              <section className="mt-16" aria-labelledby="compare">
                <h2 id="compare" className="tag mb-6">
                  {t.compare}
                </h2>
                <div className="card overflow-x-auto p-2">
                  <table className="w-full min-w-[640px] border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="w-44 p-4 text-left font-normal" />
                        {items.map((l) => (
                          <th key={l.slug} scope="col" className="p-4 text-left align-bottom font-display text-base font-normal text-white">
                            <Link href={href(lang, `/locations/${l.slug}`)} className="hover:text-accent-bright">
                              {l.name}
                            </Link>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.label} className="border-t border-white/[0.06]">
                          <th scope="row" className="p-4 text-left align-top text-[13px] font-normal text-fg-subtle">
                            {r.label}
                          </th>
                          {items.map((l) => (
                            <td key={l.slug} className="p-4 align-top text-white">
                              {r.value(l)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
