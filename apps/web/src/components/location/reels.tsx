'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { dict } from '@/lib/i18n';
import type { Lang, PublicVideo } from '@/lib/types';
import { VideoPlayer } from './video-player';

/** Flagship showreel with switchable grades / moods of the same footage, plus B-roll */
export function Reels({ lang, reels, broll }: { lang: Lang; reels: PublicVideo[]; broll: PublicVideo[] }) {
  const t = dict(lang).location;
  const [active, setActive] = useState(0);
  const [clip, setClip] = useState<number | null>(null);
  const reel = reels[active];
  const shown = clip !== null ? broll[clip] : reel;
  if (!shown) return null;

  return (
    <div>
      {/* Grades share one player so the position carries over; a B-roll clip is different footage and starts fresh */}
      <VideoPlayer key={clip ?? 'reel'} lang={lang} video={shown} autoPlay={clip !== null} className="rounded-3xl border border-border" />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {reels.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] tracking-[0.16em] text-fg-subtle uppercase">{t.grade}</span>
            <div className="flex flex-wrap gap-1 rounded-full border border-border-strong p-1" role="tablist" aria-label={t.grade}>
              {reels.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={clip === null && i === active}
                  onClick={() => {
                    setClip(null);
                    setActive(i);
                  }}
                  className={clsx(
                    'rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                    clip === null && i === active ? 'bg-white text-black' : 'text-fg-muted hover:text-white',
                  )}
                >
                  {r.label || `${t.showreel} ${i + 1}`}
                </button>
              ))}
            </div>
          </div>
        )}
        {shown.credit && <p className="text-xs text-fg-subtle">© {shown.credit}</p>}
      </div>

      {broll.length > 0 && (
        <div className="mt-8">
          <p className="eyebrow">{t.broll}</p>
          {/* Only the clips that are not on screen: the one playing is already the big picture above */}
          <div className="scrollbar-none mt-3 flex gap-3 overflow-x-auto pb-1">
            {reels.length > 0 && clip !== null && (
              <ClipThumb label={reels[active]?.label || t.showreel} poster={reels[active]?.poster.src} onClick={() => setClip(null)} />
            )}
            {broll.map((b, i) =>
              clip === i ? null : <ClipThumb key={b.id} label={b.label ?? `B-roll ${i + 1}`} poster={b.poster.src} onClick={() => setClip(i)} />,
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ClipThumb({ label, poster, onClick }: { label: string; poster?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-48 shrink-0 text-left opacity-80 transition-opacity hover:opacity-100">
      <span className="block aspect-video overflow-hidden rounded-xl border-2 border-transparent bg-bg-2 hover:border-border-strong">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {poster && <img src={poster} alt="" loading="lazy" className="size-full object-cover" />}
      </span>
      <span className="mt-1.5 block truncate text-xs text-fg-muted">{label}</span>
    </button>
  );
}
