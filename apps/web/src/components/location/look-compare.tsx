'use client';

import clsx from 'clsx';
import { useRef, useState } from 'react';
import { dict } from '@/lib/i18n';
import type { Lang, PublicImage } from '@/lib/types';

/** Browser approximations of common grades: a CSS filter plus a colour layer blended over it */
const LOOKS = {
  dayForNight: { filter: 'brightness(0.5) saturate(0.55) contrast(1.15) hue-rotate(-8deg)', overlay: 'rgba(25,60,150,0.45)', blend: 'multiply' },
  tealOrange: { filter: 'contrast(1.12) saturate(1.3) sepia(0.12)', overlay: 'linear-gradient(180deg, rgba(0,128,140,0.35), rgba(255,140,40,0.25))', blend: 'soft-light' },
  bleach: { filter: 'saturate(0.35) contrast(1.35) brightness(0.95)', overlay: 'rgba(120,140,150,0.15)', blend: 'soft-light' },
  noir: { filter: 'grayscale(1) contrast(1.45) brightness(0.9)', overlay: 'transparent', blend: 'normal' },
  golden: { filter: 'sepia(0.35) saturate(1.35) brightness(1.05) contrast(1.05)', overlay: 'rgba(255,150,40,0.22)', blend: 'soft-light' },
} as const;
export type Look = keyof typeof LOOKS;
export const LOOK_KEYS = Object.keys(LOOKS) as Look[];

/** Before / after on one photo: drag the line (or use the arrow keys) to compare "as shot" with a look */
export function LookCompare({ lang, image, look }: { lang: Lang; image: PublicImage; look: Look }) {
  const t = dict(lang).look;
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const g = LOOKS[look];

  const moveTo = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <div
      ref={box}
      className="relative inline-block touch-none select-none"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        moveTo(e.clientX);
      }}
      onPointerMove={(e) => e.buttons && moveTo(e.clientX)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.src} srcSet={image.srcSet} sizes="100vw" alt={image.alt} draggable={false} className="block max-h-[calc(100svh-13rem)] max-w-full rounded-lg object-contain" />
      <div className="absolute inset-0 overflow-hidden rounded-lg" style={{ clipPath: `inset(0 0 0 ${pos}%)` }} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.src} srcSet={image.srcSet} sizes="100vw" alt="" draggable={false} className="size-full object-contain" style={{ filter: g.filter }} />
        <div className="absolute inset-0" style={{ background: g.overlay, mixBlendMode: g.blend as React.CSSProperties['mixBlendMode'] }} />
      </div>
      <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[10px] tracking-wider text-white uppercase backdrop-blur">
        {t.original}
      </span>
      <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-accent px-2.5 py-1 font-mono text-[10px] tracking-wider text-white uppercase">{t.looks[look]}</span>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_12px_rgba(0,0,0,.6)]" style={{ left: `${pos}%` }}>
        <button
          type="button"
          role="slider"
          aria-label={t.hint}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              e.stopPropagation();
              setPos((p) => Math.min(100, Math.max(0, p + (e.key === 'ArrowLeft' ? -5 : 5))));
            }
          }}
          className={clsx(
            'pointer-events-auto absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border-2 border-white bg-black/60 text-white backdrop-blur',
            'focus-visible:ring-2 focus-visible:ring-accent-bright focus-visible:outline-none',
          )}
        >
          <span aria-hidden="true" className="text-sm">
            ⟨⟩
          </span>
        </button>
      </div>
    </div>
  );
}
