'use client';

import { ArrowUpRight, Check } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ApiError, apiFetch } from '@/lib/client-api';
import { dict, href } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

/** Footer sign-up for production news; subscribing is the consent, stated right under the field */
export function NewsletterForm({ lang }: { lang: Lang }) {
  const t = dict(lang).newsletter;
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error' | 'invalid'>('idle');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setState('invalid');
    setState('busy');
    try {
      await apiFetch('/public/subscribe', {
        method: 'POST',
        body: { email: email.trim(), consent: true, locale: lang, sourcePath: window.location.pathname, website: website || undefined },
      });
      setState('done');
      setEmail('');
    } catch (err) {
      setState(err instanceof ApiError && err.code === 'INVALID_EMAIL' ? 'invalid' : 'error');
    }
  };

  return (
    <form onSubmit={submit} noValidate className="w-full max-w-md">
      <p className="eyebrow mb-2">{t.title}</p>
      <p className="mb-4 text-sm text-fg-muted">{t.text}</p>
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
        <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      {state === 'done' ? (
        <p role="status" className="flex h-12 items-center gap-2 text-sm text-success">
          <Check className="size-4" /> {t.done}
        </p>
      ) : (
        <div className="flex h-12 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] pr-1.5 pl-5 focus-within:border-white/30">
          <label htmlFor="newsletter-email" className="sr-only">
            Email
          </label>
          <input
            id="newsletter-email"
            type="email"
            autoComplete="email"
            placeholder={t.placeholder}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (state !== 'busy') setState('idle');
            }}
            maxLength={254}
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
          />
          <button type="submit" disabled={state === 'busy'} className="btn-light h-9 gap-1.5 px-4 text-[13px]">
            {t.button} <ArrowUpRight className="size-3.5" />
          </button>
        </div>
      )}
      {(state === 'invalid' || state === 'error') && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {state === 'invalid' ? t.invalid : t.error}
        </p>
      )}
      <p className="mt-2.5 text-xs text-fg-subtle">
        {t.consentBefore}
        <Link href={href(lang, '/privacy')} className="underline underline-offset-2 hover:text-white">
          {t.consentLink}
        </Link>
        .
      </p>
    </form>
  );
}
