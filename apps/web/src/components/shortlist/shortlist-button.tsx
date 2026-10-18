'use client';

import clsx from 'clsx';
import { Bookmark } from 'lucide-react';
import { dict } from '@/lib/i18n';
import { useShortlist } from '@/lib/shortlist';
import type { Lang } from '@/lib/types';

/** Bookmark toggle: a round icon over card photos, or a labelled pill on the location page */
export function ShortlistButton({ lang, slug, name, variant = 'icon', className }: { lang: Lang; slug: string; name: string; variant?: 'icon' | 'pill'; className?: string }) {
  const t = dict(lang).shortlist;
  const { has, toggle } = useShortlist();
  const on = has(slug);
  const label = on ? `${t.added}: ${name}` : `${t.add}: ${name}`;

  if (variant === 'pill') {
    return (
      <button type="button" onClick={() => toggle(slug)} aria-pressed={on} className={clsx(on ? 'btn-light' : 'btn-ghost', className)}>
        <Bookmark className={clsx('size-4', on && 'fill-accent text-accent')} />
        {on ? t.added : t.add}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(slug);
      }}
      aria-pressed={on}
      aria-label={label}
      title={on ? t.added : t.add}
      className={clsx(
        'flex size-9 items-center justify-center rounded-full border backdrop-blur transition-all duration-200 active:scale-90',
        on ? 'border-accent bg-accent text-white shadow-[0_6px_20px_var(--accent-glow)]' : 'border-white/15 bg-black/50 text-white hover:border-white/40',
        className,
      )}
    >
      <Bookmark className={clsx('size-4', on && 'fill-white')} />
    </button>
  );
}
