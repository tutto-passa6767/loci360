'use client';

import { Sunrise, Sunset, Sun, Moon, Clock } from 'lucide-react';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { Headline } from '@/components/site/headline';
import { dict } from '@/lib/i18n';
import { compassPoint, kzMinutes, kzTime, kzToday, KZ_OFFSET_H, sunDay, sunPosition } from '@/lib/sun';
import type { Lang } from '@/lib/types';

const noop = () => () => {};

/** Sky colour for a sun altitude: night, blue hour, civil twilight, golden hour, day */
function band(alt: number) {
  if (alt < -8) return '#121217';
  if (alt < -4) return '#2f4f9e';
  if (alt < -0.833) return '#5a4a8a';
  if (alt < 6) return '#f2a33a';
  return '#3a3a3a';
}

/** The day as one 24-hour bar: sampled every 5 minutes, merged into hard-stop gradient runs */
function dayGradient(date: string, lat: number, lng: number) {
  const [y, m, d] = date.split('-').map(Number);
  const start = Date.UTC(y, m - 1, d) - KZ_OFFSET_H * 3_600_000;
  const runs: { color: string; from: number; to: number }[] = [];
  for (let min = 0; min <= 1440; min += 5) {
    const color = band(sunPosition(new Date(start + min * 60_000), lat, lng).altitude);
    const last = runs[runs.length - 1];
    if (last && last.color === color) last.to = min;
    else runs.push({ color, from: min, to: min });
  }
  const pct = (v: number) => `${((v / 1440) * 100).toFixed(2)}%`;
  return `linear-gradient(90deg, ${runs.map((r) => `${r.color} ${pct(r.from)} ${pct(r.to + 5)}`).join(', ')})`;
}

/** Bearing on the compass circle: 0° = north (up), clockwise */
const polar = (cx: number, cy: number, r: number, bearing: number) => {
  const a = (bearing * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)] as const;
};

export function SunPlanner({ lang, lat, lng }: { lang: Lang; lat: number; lng: number }) {
  const t = dict(lang).sun;
  // Today depends on the visitor's clock, so the server renders without a date and the browser fills it in
  const today = useSyncExternalStore(noop, kzToday, () => null);
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked ?? today;
  const day = useMemo(() => (date ? sunDay(date, lat, lng) : null), [date, lat, lng]);
  const gradient = useMemo(() => (date ? dayGradient(date, lat, lng) : null), [date, lat, lng]);
  const nowMin = date && date === today ? kzMinutes(new Date()) : null;
  const range = (a: Date | null, b: Date | null) => (a && b ? `${kzTime(a)} – ${kzTime(b)}` : '—');
  const dir = (b: number | null) => (b == null ? '' : `${Math.round(b)}° ${compassPoint(b, lang)}`);

  const tiles = day
    ? [
        { icon: Moon, label: t.blueAm, value: day.blueMorning ? range(...day.blueMorning) : '—', tone: 'blue' },
        { icon: Sunrise, label: t.sunrise, value: kzTime(day.sunrise), sub: dir(day.sunriseBearing), tone: 'gold' },
        { icon: Sun, label: t.goldenAm, value: range(day.sunrise, day.goldenMorningEnd), tone: 'gold' },
        { icon: Sun, label: t.noon, value: kzTime(day.noon), sub: t.sunHeight(Math.round(day.noonAltitude)), tone: 'day' },
        { icon: Sun, label: t.goldenPm, value: range(day.goldenEveningStart, day.sunset), tone: 'gold' },
        { icon: Sunset, label: t.sunset, value: kzTime(day.sunset), sub: dir(day.sunsetBearing), tone: 'gold' },
        { icon: Moon, label: t.bluePm, value: day.blueEvening ? range(...day.blueEvening) : '—', tone: 'blue' },
        { icon: Clock, label: t.dayLength, value: day.dayLengthMin != null ? t.hm(day.dayLengthMin) : '—', tone: 'day' },
      ]
    : [];

  // Compass: the sun's path along the horizon from sunrise through the south to sunset
  const C = 110;
  const R = 84;
  let arc: string | null = null;
  if (day?.sunriseBearing != null && day.sunsetBearing != null) {
    const [x1, y1] = polar(C, C, R, day.sunriseBearing);
    const [x2, y2] = polar(C, C, R, day.sunsetBearing);
    const large = day.sunsetBearing - day.sunriseBearing > 180 ? 1 : 0;
    arc = `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }

  return (
    <div className="card overflow-hidden p-6 sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="tag">{t.eyebrow}</p>
          <Headline text={t.title} className="mt-5 text-3xl leading-[1.05] text-white sm:text-5xl" />
          <p className="mt-4 text-sm leading-relaxed text-fg-muted">{t.text}</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="block">
            <span className="label">{t.date}</span>
            <input type="date" className="input w-44" value={date ?? ''} onChange={(e) => setPicked(e.target.value || null)} />
          </label>
          <button type="button" className="btn-ghost h-11" onClick={() => setPicked(null)} disabled={!picked || picked === today}>
            {t.today}
          </button>
        </div>
      </div>

      {day && gradient && (
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
          <div>
            {/* 24-hour bar */}
            <div className="relative">
              <div className="h-10 rounded-full border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" style={{ background: gradient }} />
              {nowMin != null && (
                <div className="absolute -top-1.5 -bottom-1.5 w-0.5 rounded-full bg-accent shadow-[0_0_10px_2px_var(--accent-glow)]" style={{ left: `${(nowMin / 1440) * 100}%` }}>
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 font-mono text-[10px] text-accent-bright uppercase">{t.now}</span>
                </div>
              )}
              <div className="mt-2 flex justify-between font-mono text-[10px] text-white/40">
                {['00', '03', '06', '09', '12', '15', '18', '21', '24'].map((h) => (
                  <span key={h}>{h}:00</span>
                ))}
              </div>
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-fg-muted">
              {[
                ['#121217', t.legendNight],
                ['#2f4f9e', t.legendBlue],
                ['#f2a33a', t.legendGolden],
                ['#3a3a3a', t.legendDay],
              ].map(([c, l]) => (
                <li key={l} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full border border-white/15" style={{ background: c }} />
                  {l}
                </li>
              ))}
            </ul>

            <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              {tiles.map((x) => (
                <div key={x.label} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <dt className="flex items-center gap-1.5 text-[11px] leading-tight text-fg-muted">
                    <x.icon className={x.tone === 'gold' ? 'size-3.5 text-[#f2a33a]' : x.tone === 'blue' ? 'size-3.5 text-[#7b9bf0]' : 'size-3.5 text-white/60'} />
                    {x.label}
                  </dt>
                  <dd className="mt-2 font-display text-xl tracking-[-0.02em] text-white tabular-nums">{x.value}</dd>
                  {x.sub && <dd className="mt-0.5 font-mono text-[11px] text-white/45">{x.sub}</dd>}
                </div>
              ))}
            </dl>
          </div>

          {/* Compass */}
          <figure className="mx-auto w-full max-w-[260px]">
            <svg viewBox="0 0 220 220" className="w-full" role="img" aria-label={`${t.compass}: ${t.sunrise} ${dir(day.sunriseBearing)}, ${t.sunset} ${dir(day.sunsetBearing)}`}>
              <circle cx={C} cy={C} r={R} fill="none" stroke="rgba(255,255,255,0.12)" />
              <circle cx={C} cy={C} r={R - 26} fill="none" stroke="rgba(255,255,255,0.05)" />
              {Array.from({ length: 36 }, (_, i) => {
                const [x1, y1] = polar(C, C, R, i * 10);
                const [x2, y2] = polar(C, C, R - (i % 9 === 0 ? 10 : 5), i * 10);
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.25)" />;
              })}
              {(lang === 'ru' ? ['С', 'В', 'Ю', 'З'] : ['N', 'E', 'S', 'W']).map((l, i) => {
                const [x, y] = polar(C, C, R + 14, i * 90);
                return (
                  <text key={l} x={x} y={y + 4} textAnchor="middle" fontSize="11" fill={i === 0 ? '#ff5263' : 'rgba(255,255,255,0.55)'} fontFamily="var(--font-mono)">
                    {l}
                  </text>
                );
              })}
              {arc && <path d={arc} fill="none" stroke="#f2a33a" strokeWidth="3" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 6px rgba(242,163,58,0.7))' }} />}
              {[
                { b: day.sunriseBearing, c: '#f2a33a' },
                { b: day.sunsetBearing, c: '#e61e32' },
              ].map(({ b, c }) =>
                b == null ? null : (
                  <g key={c}>
                    <line x1={C} y1={C} x2={polar(C, C, R, b)[0]} y2={polar(C, C, R, b)[1]} stroke={c} strokeOpacity="0.6" strokeDasharray="3 4" />
                    <circle cx={polar(C, C, R, b)[0]} cy={polar(C, C, R, b)[1]} r="6" fill={c} />
                  </g>
                ),
              )}
              <circle cx={C} cy={C} r="3" fill="#fff" />
            </svg>
            <figcaption className="mt-2 text-center text-[11px] text-fg-muted">{t.compass}</figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}
