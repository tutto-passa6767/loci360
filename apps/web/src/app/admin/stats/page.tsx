'use client';

import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Card, Empty, Loading, PageHeader } from '@/components/admin/ui';
import { useApi } from '@/lib/admin';

type Metric = 'visit' | 'view' | 'location' | 'pdf' | 'shortlistPdf' | 'request' | 'reel' | 'panorama' | 'shortlist';
interface Stats {
  from: string;
  to: string;
  days: number;
  totals: Record<Metric, number>;
  previous: Record<Metric, number>;
  series: { day: string; visits: number; views: number; requests: number }[];
  topLocations: { slug: string; name: string; views: number; pdf: number; reel: number; panorama: number; shortlist: number; requests: number }[];
  pages: { key: string; count: number }[];
  referrers: { key: string; count: number }[];
  devices: { key: string; count: number }[];
  langs: { key: string; count: number }[];
}

// One series, one hue: validated for the dark card surface (dataviz validate_palette)
const BAR = '#5a8be8';
const PERIODS = [7, 30, 90] as const;
const DEVICE: Record<string, string> = { desktop: 'Компьютер', mobile: 'Телефон', tablet: 'Планшет' };
const PAGE: Record<string, string> = {
  '/': 'Главная',
  '/locations': 'Каталог локаций',
  '/request': 'Заявка на скаутинг',
  '/shortlist': 'Подборка',
  '/why-kazakhstan': 'Почему Казахстан',
  '/incentives': 'Кэшбэк',
  '/permits': 'Разрешения',
  '/services': 'Сервисные компании',
  '/privacy': 'Конфиденциальность',
};

const fmt = (n: number) => n.toLocaleString('ru-RU');
const dayLabel = (d: string, long = false) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: long ? 'long' : 'short', timeZone: 'UTC', ...(long ? { weekday: 'short' } : {}) });

/** Anonymous site statistics: counters kept by the API, no cookies (apps/api/src/common/stats.service.ts) */
export default function StatsPage() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const { data } = useApi<Stats>(`/admin/stats?days=${days}`, { refreshInterval: 60_000, keepPreviousData: true });

  return (
    <div>
      <PageHeader
        title="Статистика"
        subtitle="Анонимные счётчики сайта без cookie: кто смотрит какие локации и что скачивает. Боты не учитываются."
        actions={
          <div role="group" aria-label="Период" className="flex rounded-full border border-border p-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={days === p}
                onClick={() => setDays(p)}
                className={clsx('rounded-full px-3.5 py-1.5 text-sm transition-colors', days === p ? 'bg-white text-black' : 'text-fg-muted hover:text-white')}
              >
                {p} дн.
              </button>
            ))}
          </div>
        }
      />
      {!data ? <Loading /> : <Report data={data} />}
    </div>
  );
}

function Report({ data }: { data: Stats }) {
  const t = data.totals;
  const p = data.previous;
  const tiles: { label: string; value: number; prev: number; hint: string }[] = [
    { label: 'Визиты', value: t.visit, prev: p.visit, hint: 'первая страница, открытая во вкладке' },
    { label: 'Просмотры страниц', value: t.view, prev: p.view, hint: t.visit ? `${(t.view / t.visit).toFixed(1).replace('.', ',')} на визит` : 'за период' },
    { label: 'Просмотры локаций', value: t.location, prev: p.location, hint: `видео: ${fmt(t.reel)} · 360°: ${fmt(t.panorama)}` },
    { label: 'Скачано PDF', value: t.pdf + t.shortlistPdf, prev: p.pdf + p.shortlistPdf, hint: `паспорта: ${fmt(t.pdf)} · досье подборок: ${fmt(t.shortlistPdf)}` },
    { label: 'Заявки', value: t.request, prev: p.request, hint: t.visit ? `конверсия ${((t.request / t.visit) * 100).toFixed(1).replace('.', ',')}%` : 'за период' },
  ];
  const empty = t.view === 0 && t.request === 0 && t.pdf + t.shortlistPdf === 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.label} className="card p-5">
            <p className="text-sm text-fg-muted">{tile.label}</p>
            <p className="display mt-3 text-4xl text-white">{fmt(tile.value)}</p>
            <Delta value={tile.value} prev={tile.prev} days={data.days} />
            <p className="mt-1 text-xs text-fg-subtle">{tile.hint}</p>
          </div>
        ))}
      </div>

      {empty ? (
        <Card>
          <Empty title="Пока пусто" text="Счётчики начнут заполняться, когда посетители откроют сайт. Данные обновляются раз в минуту." />
        </Card>
      ) : (
        <>
          <Card title="Визиты по дням">
            <DailyChart series={data.series} />
          </Card>

          <Card title="Локации" className="overflow-hidden">
            <LocationsTable rows={data.topLocations} />
          </Card>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card title="Откуда приходят">
              <Bars rows={data.referrers.map((r) => ({ label: r.key || 'Прямые заходы и закладки', value: r.count }))} empty="Переходов с других сайтов пока не было." />
            </Card>
            <Card title="Страницы">
              <Bars rows={data.pages.map((r) => ({ label: PAGE[r.key] ?? r.key, value: r.count }))} empty="Кроме страниц локаций, ничего не открывали." />
            </Card>
            <Card title="Устройства и язык">
              <Bars rows={data.devices.map((r) => ({ label: DEVICE[r.key] ?? r.key, value: r.count }))} empty="Нет визитов." />
              <div className="mt-6">
                <Bars rows={data.langs.map((r) => ({ label: r.key === 'ru' ? 'Русская версия' : 'Английская версия', value: r.count }))} empty="" />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

/** Change against the previous period of the same length: arrow + sign + text, never colour alone */
function Delta({ value, prev, days }: { value: number; prev: number; days: number }) {

  if (!prev) return <p className="mt-2 text-xs text-fg-subtle">{value ? 'прошлый период: нет данных' : '—'}</p>;
  const pct = Math.round(((value - prev) / prev) * 100);
  const Icon = pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus;
  return (
    <p className={clsx('mt-2 inline-flex items-center gap-1 text-xs', pct > 0 ? 'text-success' : pct < 0 ? 'text-danger' : 'text-fg-subtle')}>
      <Icon className="size-3.5" />
      {pct > 0 ? '+' : ''}
      {pct}% к прошлым {days} дн.
    </p>
  );
}

function DailyChart({ series }: { series: Stats['series'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...series.map((d) => d.visits));
  // Axis on a round number with headroom for the peak label; the middle tick only when it is a whole number
  const top = niceCeil(max * 1.15);
  const ticks = Number.isInteger(top / 2) ? [0, top / 2, top] : [0, top];
  const peak = series.reduce((b, d, i) => (d.visits > series[b].visits ? i : b), 0);
  const labelEvery = series.length > 31 ? 14 : series.length > 7 ? 5 : 1;
  const h = hover !== null ? series[hover] : null;

  return (
    <div>
      <div className="flex">
        <div className="relative h-56 w-10 shrink-0">
          {ticks.map((v) => (
            <span key={v} className="absolute right-2 translate-y-1/2 font-mono text-[10px] text-white/40" style={{ bottom: `${(v / top) * 100}%` }}>
              {fmt(v)}
            </span>
          ))}
        </div>
        <div className="relative h-56 flex-1" onMouseLeave={() => setHover(null)}>
          {ticks.map((v) => (
            <div key={v} className={clsx('absolute inset-x-0 border-t', v === 0 ? 'border-white/25' : 'border-white/[0.07]')} style={{ bottom: `${(v / top) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex">
            {series.map((d, i) => (
              <div
                key={d.day}
                className={clsx('relative h-full flex-1', hover === i && 'bg-white/[0.04]')}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                tabIndex={0}
                aria-label={`${dayLabel(d.day, true)}: визитов ${d.visits}, просмотров ${d.views}, заявок ${d.requests}`}
              >
                {d.visits > 0 && (
                  <div
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-t-[4px]"
                    style={{ background: BAR, height: `${(d.visits / top) * 100}%`, width: 'min(24px, calc(100% - 2px))' }}
                  />
                )}
                {i === peak && d.visits > 0 && hover === null && (
                  <span className="absolute left-1/2 -translate-x-1/2 -translate-y-full pb-1 text-[11px] font-medium text-white" style={{ bottom: `${(d.visits / top) * 100}%` }}>
                    {fmt(d.visits)}
                  </span>
                )}
              </div>
            ))}
          </div>
          {h && hover !== null && (
            <div
              className="pointer-events-none absolute top-2 z-10 w-48 rounded-xl border border-border-strong bg-[#141414]/95 p-3 text-xs shadow-xl backdrop-blur"
              style={hover < series.length / 2 ? { left: `calc(${((hover + 1) / series.length) * 100}% + 8px)` } : { right: `calc(${((series.length - hover) / series.length) * 100}% + 8px)` }}
            >
              <p className="mb-2 font-medium text-white">{dayLabel(h.day, true)}</p>
              {[
                ['Визиты', h.visits],
                ['Просмотры', h.views],
                ['Заявки', h.requests],
              ].map(([k, v]) => (
                <p key={k} className="flex justify-between gap-3 text-fg-muted">
                  {k}
                  <span className="font-medium text-white tabular-nums">{fmt(v as number)}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="ml-10 flex">
        {series.map((d, i) => (
          <span key={d.day} className="flex-1 pt-2 text-center text-[10px] whitespace-nowrap text-white/40">
            {i % labelEvery === 0 || i === series.length - 1 ? dayLabel(d.day) : ''}
          </span>
        ))}
      </div>
      <details className="mt-5 rounded-xl border border-border">
        <summary className="cursor-pointer px-4 py-3 text-sm text-fg-muted hover:text-white">Все цифры по дням</summary>
        <div className="max-h-80 overflow-auto border-t border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#111] text-left text-xs text-fg-subtle">
              <tr>
                <th className="px-4 py-2 font-medium">День</th>
                <th className="px-4 py-2 text-right font-medium">Визиты</th>
                <th className="px-4 py-2 text-right font-medium">Просмотры</th>
                <th className="px-4 py-2 text-right font-medium">Заявки</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...series].reverse().map((d) => (
                <tr key={d.day}>
                  <td className="px-4 py-2 text-fg-muted">{dayLabel(d.day, true)}</td>
                  <td className="px-4 py-2 text-right text-white tabular-nums">{fmt(d.visits)}</td>
                  <td className="px-4 py-2 text-right text-white tabular-nums">{fmt(d.views)}</td>
                  <td className="px-4 py-2 text-right text-white tabular-nums">{fmt(d.requests)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** Smallest of 1, 2, 2.5, 5 × 10ⁿ (whole numbers only) that is ≥ v */
function niceCeil(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v && Number.isInteger(m * p)) return m * p;
  return 10 * p;
}

function LocationsTable({ rows }: { rows: Stats['topLocations'] }) {
  if (!rows.length) return <p className="text-sm text-fg-muted">Страницы локаций за этот период не открывали.</p>;
  const max = Math.max(1, ...rows.map((r) => r.views));
  const cols: [keyof Stats['topLocations'][number], string][] = [
    ['reel', 'Видео'],
    ['panorama', '360°'],
    ['shortlist', 'В подборку'],
    ['pdf', 'PDF'],
    ['requests', 'Заявки'],
  ];
  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="text-left text-xs text-fg-subtle">
          <tr>
            <th className="px-5 py-2 font-medium sm:px-6">Локация</th>
            <th className="w-[34%] px-3 py-2 font-medium">Просмотры</th>
            {cols.map(([, label]) => (
              <th key={label} className="px-3 py-2 text-right font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.slug}>
              <td className="px-5 py-2.5 sm:px-6">
                <Link href={`/locations/${r.slug}`} target="_blank" className="text-white hover:text-accent-bright">
                  {r.name}
                </Link>
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-white/[0.04]">
                    <div className="h-2 rounded-full" style={{ width: `${(r.views / max) * 100}%`, background: BAR }} />
                  </div>
                  <span className="w-10 text-right text-white tabular-nums">{fmt(r.views)}</span>
                </div>
              </td>
              {cols.map(([k]) => (
                <td key={k} className={clsx('px-3 py-2.5 text-right tabular-nums', r[k] ? 'text-white' : 'text-fg-subtle')}>
                  {fmt(r[k] as number)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Ranked list with a share bar; the number is always printed next to it */
function Bars({ rows, empty }: { rows: { label: string; value: number }[]; empty: string }) {
  if (!rows.length) return empty ? <p className="text-sm text-fg-muted">{empty}</p> : null;
  const total = rows.reduce((s, r) => s + r.value, 0);
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-white">{r.label}</span>
            <span className="shrink-0 text-fg-muted tabular-nums">
              {fmt(r.value)} <span className="text-fg-subtle">· {Math.round((r.value / total) * 100)}%</span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.04]">
            <div className="h-1.5 rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: BAR }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
