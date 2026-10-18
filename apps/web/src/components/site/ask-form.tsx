'use client';

import clsx from 'clsx';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ApiError, apiFetch } from '@/lib/client-api';
import { dict, href } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

/** The short way in: name, email and a question to the location manager (lands in the CMS inbox as a question) */
export function AskForm({ lang }: { lang: Lang }) {
  const t = dict(lang).ask;
  const errors = dict(lang).request.errors;
  const [form, setForm] = useState({ name: '', email: '', message: '', consent: false, website: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing = (['name', 'email', 'message'] as const).filter((k) => !form[k].trim());
    if (!form.consent) setError(errors.CONSENT_REQUIRED);
    setInvalid([...missing, ...(form.consent ? [] : ['consent'])]);
    if (missing.length || !form.consent) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/public/questions', {
        method: 'POST',
        body: {
          name: form.name,
          email: form.email,
          message: form.message,
          consent: true,
          locale: lang,
          sourcePath: window.location.pathname,
          website: form.website || undefined,
        },
      });
      setDone(true);
      setForm({ name: '', email: '', message: '', consent: false, website: '' });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) setError(errors.rate);
        else setError(errors[err.code] ?? errors.generic);
        const fields = (err.details?.fields as string[] | undefined) ?? [];
        setInvalid(fields);
      } else setError(errors.generic);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="card flex flex-col items-start gap-4 p-6 sm:p-8" role="status">
        <CheckCircle2 className="size-10 text-success" />
        <p className="display text-2xl text-white">{t.doneTitle}</p>
        <p className="text-fg-muted">{t.doneText}</p>
        <button type="button" className="btn-ghost h-11 px-5" onClick={() => setDone(false)}>
          {t.another}
        </button>
      </div>
    );
  }

  const cls = (k: string) => clsx('input', invalid.includes(k) && 'border-danger focus:border-danger');
  return (
    <form onSubmit={submit} noValidate className="card space-y-4 p-6 sm:p-8">
      <div>
        <p className="display text-2xl text-white">{t.title}</p>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">{t.text}</p>
      </div>
      {/* Honeypot: hidden from people, filled by bots */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set('website', e.target.value)} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ask-name" className="label">
            {t.name}
          </label>
          <input id="ask-name" className={cls('name')} autoComplete="name" maxLength={120} value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label htmlFor="ask-email" className="label">
            {t.email}
          </label>
          <input id="ask-email" type="email" className={cls('email')} autoComplete="email" maxLength={254} value={form.email} onChange={(e) => set('email', e.target.value)} />
        </div>
      </div>
      <div>
        <label htmlFor="ask-message" className="label">
          {t.message}
        </label>
        <textarea id="ask-message" rows={4} className={cls('message')} maxLength={2000} value={form.message} onChange={(e) => set('message', e.target.value)} />
      </div>
      <label className={clsx('flex items-start gap-3 text-sm', invalid.includes('consent') ? 'text-danger' : 'text-fg-muted')}>
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} />
        <span>
          {t.consentBefore}
          <Link href={href(lang, '/privacy')} className="underline underline-offset-2 hover:text-white" target="_blank">
            {t.consentLink}
          </Link>
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary h-12 px-6" disabled={busy}>
        {busy ? t.sending : t.send}
      </button>
    </form>
  );
}
