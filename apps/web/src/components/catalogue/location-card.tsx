'use client';

import clsx from 'clsx';
import { Mountain, Orbit, PlaneLanding, Play, Truck } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Picture } from '@/components/media/picture';
import { ShortlistButton } from '@/components/shortlist/shortlist-button';
import { accessShort, dict, href, num, seasonLabel } from '@/lib/i18n';
import type { Lang, LocationCard as Card } from '@/lib/types';

/** Directory card: cover with a muted 6-second clip on hover, genres and the logistics producers ask first */
export function LocationCard({ lang, item, priority = false, layout = 'grid' }: { lang: Lang; item: Card; priority?: boolean; layout?: 'grid' | 'list' }) {
  const t = dict(lang).catalogue;
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const start = () => {
    if (!item.preview || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const v = video.current;
    if (v) void v.play().then(() => setPlaying(true)).catch(() => undefined);
  };
  const stop = () => {
    const v = video.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
    setPlaying(false);
  };

  const meta = (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[11px] text-fg-muted">
      {item.airportKm != null && (
        <li className="flex items-center gap-1.5">
          <PlaneLanding className="size-3.5 text-accent-bright" />
          {t.fromAirport(item.airportKm, item.airportCode)}
        </li>
      )}
      <li className="flex items-center gap-1.5">
        <Truck className="size-3.5 text-accent-bright" />
        {accessShort(lang, item.heavyAccess)}
      </li>
      {item.elevationM != null && (
        <li className="flex items-center gap-1.5">
          <Mountain className="size-3.5 text-accent-bright" />
          {num(lang, item.elevationM)} {dict(lang).location.m}
        </li>
      )}
    </ul>
  );

  return (
    // The title link stretches over the whole card, so the bookmark button can sit on top without nesting inside a link
    <article
      onMouseEnter={start}
      onMouseLeave={stop}
      onFocus={start}
      onBlur={stop}
      className={clsx(
        'card group relative flex overflow-hidden p-2 transition-[border-color,box-shadow] duration-300 focus-within:border-white/[0.2] hover:border-white/[0.16] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_20px_60px_rgba(230,30,50,0.12)]',
        layout === 'grid' ? 'flex-col' : 'flex-col sm:flex-row',
      )}
    >
      <div className={clsx('relative overflow-hidden rounded-[18px] bg-bg-2', layout === 'grid' ? 'aspect-[16/10]' : 'aspect-[16/10] sm:aspect-auto sm:w-[340px] sm:shrink-0')}>
        <Picture
          image={item.cover}
          sizes={layout === 'grid' ? '(min-width: 1280px) 30vw, (min-width: 768px) 45vw, 100vw' : '340px'}
          priority={priority}
          className="absolute inset-0 size-full transition-transform duration-700 group-hover:scale-[1.04]"
        />
        {item.preview && (
          <video
            ref={video}
            src={item.preview}
            muted
            loop
            playsInline
            preload="none"
            aria-hidden="true"
            className={clsx('absolute inset-0 size-full object-cover transition-opacity duration-500', playing ? 'opacity-100' : 'opacity-0')}
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute top-3 left-3 flex gap-1.5">
          {item.hasVideo && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/50 px-2 py-1 font-mono text-[10px] font-medium tracking-wider text-white uppercase backdrop-blur">
              <Play className="size-2.5 fill-white" /> {t.video}
            </span>
          )}
          {item.hasPanorama && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/50 px-2 py-1 font-mono text-[10px] font-medium tracking-wider text-white uppercase backdrop-blur">
              <Orbit className="size-3" /> {t.panorama}
            </span>
          )}
        </div>
        <ShortlistButton lang={lang} slug={item.slug} name={item.name} className="absolute top-3 right-3 z-10" />
        {item.cluster && (
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-white/85 uppercase backdrop-blur"><span className="size-1.5 rounded-full bg-accent" />{item.cluster.name}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 px-3 pt-4 pb-3">
        <div>
          <h3 className="font-display text-xl leading-snug font-normal tracking-[-0.02em] text-white">
            <Link href={href(lang, `/locations/${item.slug}`)} className="outline-none after:absolute after:inset-0 after:rounded-3xl after:content-[''] focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent-bright">
              {item.name}
            </Link>
          </h3>
          {item.region && <p className="mt-0.5 text-[13px] text-fg-subtle">{item.region}</p>}
        </div>
        <p className={clsx('text-sm leading-relaxed text-fg-muted', layout === 'grid' && 'line-clamp-2')}>{item.summary}</p>
        {item.genres.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.genres.slice(0, layout === 'grid' ? 3 : 6).map((g) => (
              <span key={g.slug} className="chip h-6 px-2.5 text-[11px]">
                {g.label}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto pt-1">{meta}</div>
        {layout === 'list' && item.seasons.length > 0 && (
          <p className="text-xs text-fg-subtle">{item.seasons.map((s) => seasonLabel(lang, s)).join(' · ')}</p>
        )}
      </div>
    </article>
  );
}
