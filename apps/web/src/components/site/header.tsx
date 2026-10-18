'use client';

import clsx from 'clsx';
import { ArrowUpRight, Bookmark, Menu, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { dict, href } from '@/lib/i18n';
import { useShortlist } from '@/lib/shortlist';
import type { Lang } from '@/lib/types';
import { CommandPalette, openPalette } from './command-palette';
import { Logo } from './logo';

/** Path without the language prefix, so the switch keeps the visitor on the same page */
const barePath = (p: string) => p.replace(/^\/(en|ru)(?=\/|$)/, '') || '/';

/** The query string needs a Suspense boundary on statically rendered pages; until it is known the header renders without it */
export function Header({ lang }: { lang: Lang }) {
  return (
    <Suspense fallback={<HeaderBar lang={lang} search="" />}>
      <HeaderWithSearch lang={lang} />
    </Suspense>
  );
}

function HeaderWithSearch({ lang }: { lang: Lang }) {
  return <HeaderBar lang={lang} search={useSearchParams().toString()} />;
}

function HeaderBar({ lang, search }: { lang: Lang; search: string }) {
  const t = dict(lang).nav;
  const pathname = barePath(usePathname() || '/');
  const view = new URLSearchParams(search).get('view');
  const { list: shortlist } = useShortlist();
  const [scrolled, setScrolled] = useState(false);
  // The menu is open for the address it was opened on (query included), so any navigation closes it without an effect
  const here = `${pathname}?${search}`;
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === here;
  const setOpen = (fn: (v: boolean) => boolean) => setOpenOn(fn(open) ? here : null);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const links = [
    { path: '/locations', label: t.locations },
    { path: '/locations?view=map', label: t.map },
    { path: '/why-kazakhstan', label: t.why },
    { path: '/incentives', label: t.incentives },
    { path: '/permits', label: t.permits },
    { path: '/services', label: t.services },
  ];
  const active = (p: string) => {
    if (p === '/locations?view=map') return pathname === '/locations' && view === 'map';
    if (p === '/locations') return pathname.startsWith('/locations') && view !== 'map';
    return pathname === p || pathname.startsWith(`${p}/`);
  };
  // Over full-bleed media (home hero, location cover) the header starts transparent
  const overlay = pathname === '/' || /^\/locations\/[^/]+$/.test(pathname);
  const solid = !overlay || scrolled || open;

  return (
    <header
      className={clsx(
        'fixed inset-x-0 top-0 z-50 transition-[background,border-color,backdrop-filter] duration-300',
        solid ? 'border-b border-white/[0.06] bg-black/70 backdrop-blur-xl' : 'border-b border-transparent bg-gradient-to-b from-black/70 to-transparent',
      )}
    >
      <div className="container-x flex h-[var(--header-h)] items-center gap-4">
        <Link href={href(lang, '/')} aria-label="LOCI360" className="shrink-0">
          <Logo />
        </Link>
        {/* Floating pill navigation; the current section is a crimson pill */}
        <nav
          className="mx-auto hidden items-center gap-0.5 rounded-full border border-white/10 bg-black/45 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-xl xl:flex"
          aria-label="Main"
        >
          {links.map((l) => (
            <Link
              key={l.path}
              href={href(lang, l.path)}
              aria-current={active(l.path) ? 'page' : undefined}
              className={clsx(
                'rounded-full px-4 py-2 text-[13.5px] font-medium transition-colors',
                active(l.path)
                  ? 'bg-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_6px_20px_var(--accent-glow)]'
                  : 'text-white/70 hover:bg-white/[0.06] hover:text-white',
              )}
            >
              <span className="roll">
                <span>
                  {l.label}
                  <span aria-hidden="true">{l.label}</span>
                </span>
              </span>
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 xl:ml-0">
          <button
            type="button"
            onClick={openPalette}
            aria-label={dict(lang).palette.open}
            title={`${dict(lang).palette.open} (Ctrl K)`}
            className="hidden size-10 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/80 backdrop-blur-xl transition-colors hover:text-white sm:flex"
          >
            <Search className="size-4" />
          </button>
          <Link
            href={href(lang, '/shortlist')}
            aria-label={`${dict(lang).shortlist.title}: ${shortlist.length}`}
            className={clsx(
              'relative flex size-10 items-center justify-center rounded-full border backdrop-blur-xl transition-colors',
              pathname === '/shortlist' ? 'border-accent bg-accent text-white' : 'border-white/10 bg-black/45 text-white/80 hover:text-white',
            )}
          >
            <Bookmark className="size-4" />
            {shortlist.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] font-semibold text-white shadow-[0_0_10px_var(--accent-glow)]">
                {shortlist.length}
              </span>
            )}
          </Link>
          <div className="flex items-center rounded-full border border-white/10 bg-black/45 p-1 text-xs font-semibold backdrop-blur-xl" role="group" aria-label={t.language}>
            {(['en', 'ru'] as Lang[]).map((l) => (
              <Link
                key={l}
                href={href(l, pathname) + (search ? `?${search}` : '')}
                hrefLang={l}
                aria-current={l === lang ? 'true' : undefined}
                className={clsx('rounded-full px-2.5 py-1 uppercase transition-colors', l === lang ? 'bg-white text-black' : 'text-white/65 hover:text-white')}
              >
                {l}
              </Link>
            ))}
          </div>
          <Link href={href(lang, '/request')} className="btn-primary btn-sm hidden sm:inline-flex">
            {t.request}
          </Link>
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white backdrop-blur-xl xl:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? t.close : t.menu}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="h-[calc(100dvh-var(--header-h))] overflow-y-auto border-t border-white/[0.06] bg-black xl:hidden">
          <nav className="container-x flex flex-col py-6" aria-label="Mobile">
            <button
              type="button"
              onClick={() => {
                setOpen(() => false);
                openPalette();
              }}
              className="mb-2 flex h-12 items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-5 text-left text-sm text-white/60"
            >
              <Search className="size-4" /> {dict(lang).palette.placeholder}
            </button>
            {links.map((l) => (
              <Link
                key={l.path}
                href={href(lang, l.path)}
                className={clsx('display flex items-center justify-between border-b border-white/[0.08] py-4 text-3xl', active(l.path) ? 'text-accent-bright' : 'text-white')}
              >
                {l.label}
                <ArrowUpRight className="size-5 text-white/40" />
              </Link>
            ))}
            <Link href={href(lang, '/request')} className="btn-primary mt-8 h-12">
              {t.request}
            </Link>
          </nav>
        </div>
      )}
      <CommandPalette lang={lang} />
    </header>
  );
}
