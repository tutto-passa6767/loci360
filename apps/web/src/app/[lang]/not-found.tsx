'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoMark } from '@/components/site/logo';
import { dict, href } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

export default function NotFound() {
  // not-found receives no params: the language comes from the URL the visitor opened
  const lang: Lang = /^\/ru(\/|$)/.test(usePathname() ?? '') ? 'ru' : 'en';
  const t = dict(lang).notFound;
  return (
    <section className="container-x flex min-h-[80vh] flex-col items-start justify-center pt-[var(--header-h)]">
      <LogoMark className="h-14 w-auto opacity-80" />
      <p className="tag mt-8">404</p>
      <h1 className="display mt-3 text-5xl text-white sm:text-6xl">{t.title}</h1>
      <p className="mt-4 max-w-md text-fg-muted">{t.text}</p>
      <Link href={href(lang, '/locations')} className="btn-light mt-8">
        {t.back}
      </Link>
    </section>
  );
}
