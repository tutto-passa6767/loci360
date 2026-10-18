'use client';

import clsx from 'clsx';
import { ChevronLeft, ChevronRight, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Picture } from '@/components/media/picture';
import { dict, timeOfDayLabel } from '@/lib/i18n';
import { type Look, LOOK_KEYS, LookCompare } from './look-compare';
import type { Lang, LocationDetail, TimeOfDay } from '@/lib/types';

type Photo = LocationDetail['photos'][number];
const ORDER: TimeOfDay[] = ['DAY', 'GOLDEN_HOUR', 'NIGHT'];

/** High-resolution photos grouped by time of day (Day / Golden hour / Night) with a lightbox */
export function Gallery({ lang, photos }: { lang: Lang; photos: Photo[] }) {
  const t = dict(lang).location;
  const groups = useMemo(() => ORDER.filter((tod) => photos.some((p) => p.timeOfDay === tod)), [photos]);
  const [tab, setTab] = useState<TimeOfDay | 'ALL'>('ALL');
  const [open, setOpen] = useState<number | null>(null);
  const [compare, setCompare] = useState(false);
  const [look, setLook] = useState<Look>('dayForNight');
  const tl = dict(lang).look;
  const list = tab === 'ALL' ? photos : photos.filter((p) => p.timeOfDay === tab);

  const step = useCallback((d: number) => setOpen((i) => (i === null ? null : (i + d + list.length) % list.length)), [list.length]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, step]);

  const current = open !== null ? list[open] : null;

  return (
    <div>
      {groups.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-1 rounded-full border border-border-strong p-1 sm:inline-flex" role="tablist">
          {(['ALL', ...groups] as const).map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={tab === g}
              onClick={() => setTab(g)}
              className={clsx('rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors', tab === g ? 'bg-white text-black' : 'text-fg-muted hover:text-white')}
            >
              {g === 'ALL' ? t.allPhotos : timeOfDayLabel(lang, g)}
              <span className="ml-1.5 font-mono text-[10px] opacity-60">{g === 'ALL' ? photos.length : photos.filter((p) => p.timeOfDay === g).length}</span>
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {list.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpen(i)}
            className={clsx('group relative overflow-hidden rounded-2xl bg-bg-2', i === 0 && list.length > 2 ? 'col-span-2 row-span-2 aspect-[4/3] md:aspect-auto' : 'aspect-[4/3]')}
          >
            <Picture image={p} sizes={i === 0 ? '(min-width: 768px) 66vw, 100vw' : '(min-width: 768px) 33vw, 50vw'} className="absolute inset-0 size-full transition-transform duration-700 group-hover:scale-[1.03]" />
            {(p.timeOfDay || p.label) && (
              <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[10px] tracking-wider text-white uppercase backdrop-blur">
                {[p.timeOfDay ? timeOfDayLabel(lang, p.timeOfDay) : null, p.label].filter(Boolean).join(' · ')}
              </span>
            )}
          </button>
        ))}
      </div>

      {current && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-black/95" role="dialog" aria-modal="true">
          <div className="flex h-14 items-center justify-between px-4 text-white/80">
            <span className="font-mono text-xs">
              {open! + 1} / {list.length}
            </span>
            <button
              type="button"
              onClick={() => setCompare((c) => !c)}
              aria-pressed={compare}
              className={clsx('ml-auto mr-2 inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] transition-colors', compare ? 'bg-accent text-white' : 'bg-white/10 text-white hover:bg-white/20')}
            >
              <SlidersHorizontal className="size-4" /> {compare ? tl.close : tl.button}
            </button>
            <button type="button" onClick={() => setOpen(null)} className="flex size-10 items-center justify-center rounded-full hover:bg-white/10" aria-label={dict(lang).nav.close}>
              <X className="size-5" />
            </button>
          </div>
          <div className="relative flex flex-1 items-center justify-center px-4 pb-4" onClick={() => setOpen(null)}>
            {compare ? (
              <LookCompare key={current.id} lang={lang} image={current} look={look} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.src}
                srcSet={current.srcSet}
                sizes="100vw"
                alt={current.alt}
                onClick={(e) => e.stopPropagation()}
                className="max-h-full max-w-full rounded-lg object-contain"
              />
            )}
            {list.length > 1 && (
              <>
                <button type="button" onClick={(e) => (e.stopPropagation(), step(-1))} className="absolute left-4 flex size-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Previous">
                  <ChevronLeft className="size-6" />
                </button>
                <button type="button" onClick={(e) => (e.stopPropagation(), step(1))} className="absolute right-4 flex size-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Next">
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}
          </div>
          {compare && (
            <div className="flex flex-col items-center gap-2 px-4 pb-3">
              <div className="flex flex-wrap justify-center gap-1 rounded-full border border-white/15 p-1" role="radiogroup" aria-label={tl.button}>
                {LOOK_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={look === k}
                    onClick={() => setLook(k)}
                    className={clsx('rounded-full px-3.5 py-1.5 text-[13px] transition-colors', look === k ? 'bg-white text-black' : 'text-white/70 hover:text-white')}
                  >
                    {tl.looks[k]}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-white/45">{tl.note}</p>
            </div>
          )}
          <div className="px-4 pb-5 text-center text-xs text-white/60">
            {[current.timeOfDay ? timeOfDayLabel(lang, current.timeOfDay) : null, current.label, current.credit ? `© ${current.credit}` : null].filter(Boolean).join(' · ')}
          </div>
        </div>
      )}
    </div>
  );
}
