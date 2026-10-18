'use client';

import clsx from 'clsx';
import { ArrowUpRight, Play, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Scramble } from '@/components/site/scramble';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { dict, href } from '@/lib/i18n';
import type { HomeData, Lang } from '@/lib/types';

const ROTATE_MS = 11_000;

/**
 * Full-screen muted video with genre moods (Western / Sci-Fi / Modern City / Fantasy).
 * The poster of the first mood is the LCP image; videos start after it, one at a time,
 * and moods cross-fade only once the next video is actually playing.
 */
export function Hero({
  lang,
  hero,
  tags,
  stats,
  highlights,
}: {
  lang: Lang;
  hero: HomeData['hero'];
  tags: HomeData['tags'];
  stats: HomeData['stats'];
  highlights: HomeData['highlights'];
}) {
  const t = dict(lang).home;
  const router = useRouter();
  const moods = hero.length ? hero : [{ key: 'default', label: '', genreSlug: null, video: null, location: null }];
  const [active, setActive] = useState(0);
  const [shown, setShown] = useState(0);
  const [auto, setAuto] = useState(true);
  const reduced = usePrefersReducedMotion();
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const [q, setQ] = useState('');

  // Start the requested mood; reveal it when the first frame is on screen
  useEffect(() => {
    const v = videos.current[active];
    if (!v || reduced) {
      setShown(active);
      return;
    }
    v.currentTime = 0;
    const reveal = () => setShown(active);
    v.addEventListener('playing', reveal, { once: true });
    void v.play().catch(() => setShown(active));
    return () => v.removeEventListener('playing', reveal);
  }, [active, reduced]);

  // Pause the moods that are not visible
  useEffect(() => {
    videos.current.forEach((v, i) => {
      if (v && i !== active && i !== shown) v.pause();
    });
  }, [active, shown]);

  useEffect(() => {
    if (!auto || moods.length < 2 || reduced) return;
    const id = setTimeout(() => setActive((i) => (i + 1) % moods.length), ROTATE_MS);
    return () => clearTimeout(id);
  }, [auto, active, moods.length, reduced]);

  const pick = useCallback((i: number) => {
    setAuto(false);
    setActive(i);
  }, []);

  const current = moods[shown];
  const exploreHref = href(lang, current.genreSlug ? `/locations?genre=${current.genreSlug}` : '/locations');

  return (
    <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-black">
      {/* media layers */}
      <div className="grain absolute inset-0 -z-10">
        {moods.map((m, i) => {
          const visible = i === shown;
          return (
            <div key={m.key} className={clsx('absolute inset-0 transition-opacity duration-[1200ms]', visible ? 'opacity-100' : 'opacity-0')} aria-hidden={!visible}>
              {m.video ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.video.poster.src}
                    srcSet={m.video.poster.srcSet}
                    sizes="100vw"
                    alt=""
                    loading={i === 0 ? 'eager' : 'lazy'}
                    fetchPriority={i === 0 ? 'high' : 'auto'}
                    className="absolute inset-0 size-full object-cover"
                    style={{ backgroundImage: m.video.poster.blur ? `url(${m.video.poster.blur})` : undefined, backgroundSize: 'cover' }}
                  />
                  {m.video.loop && !reduced && (
                    <video
                      ref={(el) => {
                        videos.current[i] = el;
                      }}
                      src={i === active || i === shown ? m.video.loop : undefined}
                      muted
                      loop
                      playsInline
                      preload={i === active ? 'auto' : 'none'}
                      className="absolute inset-0 size-full object-cover"
                    />
                  )}
                </>
              ) : (
                <div className="topo absolute inset-0" />
              )}
            </div>
          );
        })}
        {/* black from the left and the bottom for the copy, a crimson glow rising on the right */}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,.88)_0%,rgba(0,0,0,.55)_38%,rgba(0,0,0,.1)_70%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black" />
        <div className="absolute inset-0 bg-[radial-gradient(55%_45%_at_85%_100%,rgba(230,30,50,.32),transparent_70%)] mix-blend-screen" />
      </div>

      <div className="container-x grid flex-1 grid-cols-1 items-end gap-10 pt-[calc(var(--header-h)+56px)] pb-10 sm:pb-14 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
        <div className="min-w-0 animate-fade-up">
          <p className="tag">{t.eyebrow}</p>
          <h1 className="display mt-6 text-[48px] leading-[0.95] text-white sm:text-[76px] lg:text-[104px]">
            {t.titleLead} <span className="dim">{t.titleTail}</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-fg-muted sm:text-lg">{t.subtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {/* "Request scouting" lives in the header right above — one call to explore here */}
            <Link href={exploreHref} className="group btn-primary h-12 pr-2 pl-6">
              {t.explore}
              <span className="btn-dot ml-1">
                <ArrowUpRight className="size-4" />
              </span>
            </Link>
          </div>

          {/* search + quick tags */}
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(href(lang, q.trim() ? `/locations?q=${encodeURIComponent(q.trim())}` : '/locations'));
            }}
            className="mt-10 max-w-xl"
          >
            <div className="flex h-14 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] pr-1.5 pl-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl focus-within:border-white/30">
              <Search className="size-4 shrink-0 text-white/55" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t.searchPlaceholder}
                aria-label={t.search}
                className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/45"
              />
              <button type="submit" className="btn-light h-11">
                {t.search}
              </button>
            </div>
            {tags.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] tracking-[0.16em] text-white/50 uppercase">{t.quickTags}</span>
                {tags.map((tag) => (
                  <Link
                    key={tag.slug}
                    href={href(lang, `/locations?tag=${tag.slug}`)}
                    className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-white/80 backdrop-blur transition-colors hover:border-accent/60 hover:text-white"
                  >
                    {tag.label}
                  </Link>
                ))}
              </div>
            )}
          </form>

          {/* stat tiles */}
          <dl className="mt-10 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { value: String(stats.locations), label: t.statLocations },
              { value: String(stats.clusters), label: t.statClusters },
              ...highlights.slice(0, 1),
            ].map((s, i) => (
              <div key={s.label} className={clsx('glass flex min-h-[124px] flex-col justify-between rounded-2xl p-4', i === 2 && 'hidden sm:flex')}>
                <dt className="line-clamp-2 text-[12px] leading-snug text-white/60">{s.label}</dt>
                <dd className="stat mt-4 text-[40px] leading-none">
                  <Scramble text={s.value} />
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* right rail: what is on screen now + genre moods */}
        <div className="flex min-w-0 flex-col gap-3 lg:pb-1">
          {current.location && (
            <Link href={href(lang, `/locations/${current.location.slug}`)} className="group glass flex items-center gap-4 rounded-2xl p-3 pr-4">
              {/* An on-air mark, not a picture: the reel itself is the picture behind it */}
              <span className="relative flex size-16 shrink-0 items-center justify-center rounded-xl bg-accent shadow-[0_8px_30px_var(--accent-glow)]">
                <span className="absolute inset-0 animate-ping rounded-xl bg-accent/40 [animation-duration:2.4s] motion-reduce:hidden" />
                <Play className="relative size-6 fill-white text-white" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[10px] tracking-[0.16em] text-accent-bright uppercase">{t.nowShowing}</span>
                <span className="mt-1 block truncate text-sm font-medium text-white">{current.location.name}</span>
                {current.location.region && <span className="block truncate text-xs text-white/55">{current.location.region}</span>}
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-white/60 transition-transform group-hover:rotate-45 group-hover:text-white" />
            </Link>
          )}
          {moods.length > 1 && (
            <div className="glass rounded-2xl p-2" role="tablist" aria-label={t.moods}>
              <p className="px-3 pt-2 pb-1 font-mono text-[10px] tracking-[0.16em] text-white/50 uppercase">{t.moods}</p>
              {moods.map((m, i) => (
                <button
                  key={m.key}
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  onClick={() => pick(i)}
                  className={clsx(
                    'relative flex w-full items-center justify-between overflow-hidden rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
                    i === active ? 'bg-white/[0.08] text-white' : 'text-white/60 hover:bg-white/[0.04] hover:text-white',
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <span className={clsx('size-1.5 rounded-full', i === active ? 'bg-accent shadow-[0_0_10px_2px_var(--accent-glow)]' : 'bg-white/25')} />
                    {m.label}
                  </span>
                  <span className="font-mono text-[10px] text-white/35">{String(i + 1).padStart(2, '0')}</span>
                  {i === active && auto && !reduced && (
                    <span key={`${active}-progress`} className="absolute bottom-0 left-0 h-px bg-accent" style={{ animation: `hero-progress ${ROTATE_MS}ms linear forwards` }} />
                  )}
                </button>
              ))}
              {!current.video && <p className="px-3 pt-1 pb-2 text-xs text-white/50">{t.noVideo}</p>}
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes hero-progress { from { width: 0 } to { width: 100% } }`}</style>
    </section>
  );
}
