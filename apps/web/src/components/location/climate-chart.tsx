'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { Headline } from '@/components/site/headline';
import { dict, num } from '@/lib/i18n';
import type { ClimateMonthly, Lang, Season } from '@/lib/types';

// Validated against the dark card surface (dataviz validate_palette: lightness band, CVD, contrast)
const TEMP = '#d07a28';
const RAIN = '#5a8be8';

const SEASON_MONTHS: Record<Season, number[]> = { WINTER: [11, 0, 1], SPRING: [2, 3, 4], SUMMER: [5, 6, 7], AUTUMN: [8, 9, 10] };

/** Weather by month: a temperature range chart and a precipitation chart (one axis each), hover details and a table */
export function ClimateChart({ lang, climate, seasons }: { lang: Lang; climate: ClimateMonthly; seasons: Season[] }) {
  const t = dict(lang).climate;
  const [hover, setHover] = useState<number | null>(null);
  const m = climate.months;
  const best = new Set(seasons.flatMap((s) => SEASON_MONTHS[s]));

  // Temperature axis on 10° steps around the data
  const lo = Math.floor((Math.min(...m.map((x) => x.tmin)) - 2) / 10) * 10;
  const hi = Math.ceil((Math.max(...m.map((x) => x.tmax)) + 2) / 10) * 10;
  const ticks = Array.from({ length: (hi - lo) / 10 + 1 }, (_, i) => lo + i * 10);
  const y = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const warmest = m.reduce((b, x, i) => (x.tmax > m[b].tmax ? i : b), 0);
  const coldest = m.reduce((b, x, i) => (x.tmin < m[b].tmin ? i : b), 0);

  const pMax = Math.max(10, ...m.map((x) => x.precip));
  const pTop = Math.ceil(pMax / 20) * 20;
  const wettest = m.reduce((b, x, i) => (x.precip > m[b].precip ? i : b), 0);
  const deg = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(lang, Math.abs(Math.round(v)))}°`;

  const details = (i: number) => [
    [t.max, deg(m[i].tmax)],
    [t.min, deg(m[i].tmin)],
    [t.precipShort, `${num(lang, m[i].precip)} ${t.mm}`],
    [t.rainDays, num(lang, m[i].rainDays)],
    [t.sun, `${num(lang, m[i].sunHours)} ${t.h}`],
    ...(m[i].snowCm > 0 ? [[t.snow, `${num(lang, m[i].snowCm)} ${t.cm}`]] : []),
  ];

  /** One month column: the hover/focus target spans the whole slot, wider than the bar */
  const column = (i: number, children: React.ReactNode) => (
    <div
      key={i}
      className={clsx('relative h-full flex-1 transition-colors', hover === i && 'bg-white/[0.04]')}
      onMouseEnter={() => setHover(i)}
      onMouseLeave={() => setHover(null)}
    >
      {children}
    </div>
  );

  return (
    <div className="card p-6 sm:p-8">
      <div className="max-w-2xl">
        <p className="tag">{t.eyebrow}</p>
        <Headline text={t.title} className="mt-5 text-3xl leading-[1.05] text-white sm:text-5xl" />
        <p className="mt-4 text-sm leading-relaxed text-fg-muted">{t.text(climate.period)}</p>
      </div>

      <div className="relative mt-8">
        {/* Temperature */}
        <p className="mb-3 text-[13px] text-fg-muted">{t.temp}</p>
        <div className="flex">
          <div className="relative h-56 w-9 shrink-0">
            {ticks.map((v) => (
              <span key={v} className="absolute right-2 translate-y-1/2 font-mono text-[10px] text-white/40" style={{ bottom: `${y(v)}%` }}>
                {v}
              </span>
            ))}
          </div>
          <div className="relative h-56 flex-1">
            {ticks.map((v) => (
              <div key={v} className={clsx('absolute inset-x-0 border-t', v === 0 ? 'border-white/25' : 'border-white/[0.07]')} style={{ bottom: `${y(v)}%` }} />
            ))}
            <div className="absolute inset-0 flex">
              {m.map((x, i) =>
                column(
                  i,
                  <>
                    <div
                      className="absolute left-1/2 w-3.5 max-w-6 -translate-x-1/2 rounded-[4px] sm:w-5"
                      style={{ background: TEMP, bottom: `${y(x.tmin)}%`, height: `${Math.max(1, y(x.tmax) - y(x.tmin))}%` }}
                    />
                    {i === warmest && (
                      <span className="absolute left-1/2 -translate-x-1/2 -translate-y-full pb-1 text-[11px] font-medium text-white" style={{ bottom: `${y(x.tmax)}%` }}>
                        {deg(x.tmax)}
                      </span>
                    )}
                    {i === coldest && (
                      <span className="absolute left-1/2 -translate-x-1/2 translate-y-full pt-1 text-[11px] font-medium text-white" style={{ bottom: `${y(x.tmin)}%` }}>
                        {deg(x.tmin)}
                      </span>
                    )}
                  </>,
                ),
              )}
            </div>
          </div>
        </div>

        {/* Precipitation */}
        <p className="mt-7 mb-7 text-[13px] text-fg-muted">{t.precip}</p>
        <div className="flex">
          <div className="relative h-24 w-9 shrink-0">
            {[0, pTop / 2, pTop].map((v) => (
              <span key={v} className="absolute right-2 translate-y-1/2 font-mono text-[10px] text-white/40" style={{ bottom: `${(v / pTop) * 100}%` }}>
                {v}
              </span>
            ))}
          </div>
          <div className="relative h-24 flex-1">
            {[0, pTop / 2, pTop].map((v) => (
              <div key={v} className={clsx('absolute inset-x-0 border-t', v === 0 ? 'border-white/25' : 'border-white/[0.07]')} style={{ bottom: `${(v / pTop) * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex">
              {m.map((x, i) =>
                column(
                  i,
                  <>
                    <div className="absolute bottom-0 left-1/2 w-3.5 -translate-x-1/2 rounded-t-[4px] sm:w-5" style={{ background: RAIN, height: `${(x.precip / pTop) * 100}%` }} />
                    {i === wettest && (
                      <span className="absolute left-1/2 -translate-x-1/2 -translate-y-full pb-1 text-[11px] font-medium text-white" style={{ bottom: `${(x.precip / pTop) * 100}%` }}>
                        {num(lang, x.precip)}
                      </span>
                    )}
                  </>,
                ),
              )}
            </div>
          </div>
        </div>

        {/* Months, with the location's best season marked */}
        <div className="mt-2 flex pl-9">
          {m.map((_, i) => (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${t.monthsLong[i]}: ${details(i).map(([k, v]) => `${k} ${v}`).join(', ')}`}
              className={clsx('flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md py-1 text-[9.5px] tracking-tight focus-visible:outline-offset-0 sm:text-[11px] sm:tracking-normal', best.has(i) ? 'text-white' : 'text-white/45')}
            >
              {t.months[i]}
              <span className={clsx('size-1.5 rounded-full', best.has(i) ? 'bg-accent' : 'bg-transparent')} />
            </button>
          ))}
        </div>

        {/* Tooltip */}
        {hover !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-8 z-10 w-52 rounded-2xl border border-white/10 bg-[#141414]/95 p-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur"
            // Beside the hovered month where there is room, always inside the card
            style={{ left: `clamp(0px, calc(36px + (100% - 36px) * ${(hover + 0.5) / 12} ${hover > 5 ? '- 14rem' : '+ 1rem'}), calc(100% - 13rem))` }}
          >
            <p className="text-sm font-medium text-white">{t.monthsLong[hover]}</p>
            <dl className="mt-2 space-y-1 text-xs">
              {details(hover).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-fg-muted">{k}</dt>
                  <dd className="font-medium text-white tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        {best.size > 0 && (
          <p className="flex items-center gap-2 text-xs text-fg-muted">
            <span className="size-1.5 rounded-full bg-accent" /> {t.best}
          </p>
        )}
        <p className="text-[11px] text-fg-subtle">{t.source(climate.source, climate.period)}</p>
      </div>

      <details className="group mt-5 rounded-2xl border border-white/[0.08]">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm text-fg-muted hover:text-white">{t.table}</summary>
        <div className="overflow-x-auto border-t border-white/[0.08]">
          <table className="w-full min-w-[640px] text-xs tabular-nums">
            <thead>
              <tr className="text-fg-subtle">
                <th scope="col" className="p-3 text-left font-normal">
                  {t.month}
                </th>
                {[t.max, t.min, t.precipShort, t.rainDays, t.sun, t.snow].map((h) => (
                  <th key={h} scope="col" className="p-3 text-right font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.map((x, i) => (
                <tr key={i} className="border-t border-white/[0.06] text-white">
                  <th scope="row" className={clsx('p-3 text-left font-normal', best.has(i) ? 'text-white' : 'text-fg-muted')}>
                    {t.monthsLong[i]}
                  </th>
                  <td className="p-3 text-right">{deg(x.tmax)}</td>
                  <td className="p-3 text-right">{deg(x.tmin)}</td>
                  <td className="p-3 text-right">
                    {num(lang, x.precip)} {t.mm}
                  </td>
                  <td className="p-3 text-right">{num(lang, x.rainDays)}</td>
                  <td className="p-3 text-right">
                    {num(lang, x.sunHours)} {t.h}
                  </td>
                  <td className="p-3 text-right">{x.snowCm > 0 ? `${num(lang, x.snowCm)} ${t.cm}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
