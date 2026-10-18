'use client';

import clsx from 'clsx';
import { CheckCircle2, Loader2, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ApiError, apiFetch } from '@/lib/client-api';
import type { countryOptions } from '@/lib/countries';
import { BUDGETS, budgetLabel, dict, href, PROJECT_TYPES, projectTypeLabel } from '@/lib/i18n';
import { kzToday } from '@/lib/sun';
import type { BudgetRange, Lang, LocationOption, ProjectType } from '@/lib/types';

interface Form {
  name: string;
  company: string;
  country: string;
  email: string;
  phone: string;
  projectType: ProjectType | '';
  budget: BudgetRange | '';
  shootFrom: string;
  shootTo: string;
  message: string;
  consent: boolean;
  website: string;
}

/** Scouting request form (ТЗ 3.4): name, company, country, project type, budget, dates, locations (multi-select) */
/** `countries` is built on the server: browsers and Node name some regions differently, which would break hydration */
export function RequestForm({
  lang,
  options,
  preselected,
  countries,
}: {
  lang: Lang;
  options: LocationOption[];
  preselected: string[];
  countries: ReturnType<typeof countryOptions>;
}) {
  const t = dict(lang).request;
  const [form, setForm] = useState<Form>({
    name: '',
    company: '',
    country: '',
    email: '',
    phone: '',
    projectType: '',
    budget: '',
    shootFrom: '',
    shootTo: '',
    message: '',
    consent: false,
    website: '',
  });
  const [selected, setSelected] = useState<string[]>(preselected.filter((s) => options.some((o) => o.slug === s)));
  const [query, setQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [done, setDone] = useState<number | null>(null);
  // Dates are Kazakhstan days: before 05:00 local time the UTC date is still yesterday
  const today = kzToday();

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setFieldErrors((e) => e.filter((x) => x !== k));
  };
  const filtered = options.filter((o) => {
    const q = query.trim().toLowerCase();
    return !q || `${o.name} ${o.region ?? ''} ${o.cluster ?? ''}`.toLowerCase().includes(q);
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing = (['name', 'company', 'country', 'email', 'projectType', 'budget'] as const).filter((k) => !form[k]);
    if (!form.consent) missing.push('consent' as never);
    if (missing.length) {
      setFieldErrors(missing);
      setError(missing.includes('consent' as never) && missing.length === 1 ? t.errors.CONSENT_REQUIRED : null);
      document.getElementById(`f-${missing[0]}`)?.focus();
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch<{ number: number }>('/public/leads', {
        method: 'POST',
        body: {
          name: form.name,
          company: form.company,
          country: form.country,
          email: form.email,
          phone: form.phone || undefined,
          projectType: form.projectType,
          budget: form.budget,
          shootFrom: form.shootFrom || undefined,
          shootTo: form.shootTo || undefined,
          message: form.message || undefined,
          locations: selected,
          locale: lang,
          sourcePath: window.location.pathname + window.location.search,
          consent: true,
          website: form.website || undefined,
        },
      });
      setDone(res.number);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) setError(t.errors.rate);
        else setError(t.errors[err.code] ?? t.errors.generic);
        const fields = (err.details?.fields as string[] | undefined) ?? [];
        if (err.code === 'INVALID_EMAIL') setFieldErrors(['email']);
        else if (err.code === 'INVALID_DATES') setFieldErrors(['shootTo']);
        else if (fields.length) setFieldErrors(fields);
      } else setError(t.errors.generic);
    } finally {
      setSending(false);
    }
  };

  if (done !== null) {
    return (
      <div className="card flex flex-col items-start gap-5 p-8 sm:p-12">
        <CheckCircle2 className="size-12 text-success" />
        <h2 className="display text-3xl text-white sm:text-4xl">{t.successTitle}</h2>
        <p className="max-w-lg text-lg text-fg-muted">{t.successText(done)}</p>
        <div className="flex flex-wrap gap-3">
          <Link href={href(lang, '/locations')} className="btn-light">
            {t.backToLocations}
          </Link>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setDone(null);
              setSelected([]);
            }}
          >
            {t.another}
          </button>
        </div>
      </div>
    );
  }

  const invalid = (k: string) => fieldErrors.includes(k);
  const field = (k: keyof Form, label: string, input: React.ReactNode, required = false) => (
    <div>
      <label htmlFor={`f-${k}`} className="label">
        {label}
        {required && <span className="text-accent-bright"> *</span>}
      </label>
      {input}
    </div>
  );
  const cls = (k: string) => clsx('input', invalid(k) && 'border-danger focus:border-danger');

  return (
    <form onSubmit={submit} noValidate className="space-y-8">
      {/* Honeypot: hidden from people, filled by bots */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set('website', e.target.value)} />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {field('name', t.name, <input id="f-name" className={cls('name')} autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={120} />, true)}
        {field('company', t.company, <input id="f-company" className={cls('company')} autoComplete="organization" value={form.company} onChange={(e) => set('company', e.target.value)} maxLength={200} />, true)}
        {field(
          'email',
          t.email,
          <input id="f-email" type="email" className={cls('email')} autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} maxLength={254} />,
          true,
        )}
        {field('phone', t.phone, <input id="f-phone" type="tel" className={cls('phone')} autoComplete="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} maxLength={40} />)}
        {field(
          'country',
          t.country,
          <select id="f-country" className={cls('country')} value={form.country} onChange={(e) => set('country', e.target.value)}>
            <option value="">{t.countryPlaceholder}</option>
            <optgroup label="—">
              {countries.top.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="A–Z">
              {countries.rest.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          </select>,
          true,
        )}
        {field(
          'projectType',
          t.projectType,
          <select id="f-projectType" className={cls('projectType')} value={form.projectType} onChange={(e) => set('projectType', e.target.value as ProjectType)}>
            <option value="">—</option>
            {PROJECT_TYPES.map((p) => (
              <option key={p} value={p}>
                {projectTypeLabel(lang, p)}
              </option>
            ))}
          </select>,
          true,
        )}
        {field(
          'budget',
          t.budget,
          <select id="f-budget" className={cls('budget')} value={form.budget} onChange={(e) => set('budget', e.target.value as BudgetRange)}>
            <option value="">—</option>
            {BUDGETS.map((b) => (
              <option key={b} value={b}>
                {budgetLabel(lang, b)}
              </option>
            ))}
          </select>,
          true,
        )}
        <div>
          <span className="label">{t.dates}</span>
          <div className="grid grid-cols-2 gap-2">
            <input
              id="f-shootFrom"
              type="date"
              aria-label={t.from}
              min={today}
              className={cls('shootFrom')}
              value={form.shootFrom}
              onChange={(e) => set('shootFrom', e.target.value)}
            />
            <input
              id="f-shootTo"
              type="date"
              aria-label={t.to}
              min={form.shootFrom || today}
              className={cls('shootTo')}
              value={form.shootTo}
              onChange={(e) => set('shootTo', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Locations multi-select */}
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="label mb-0">{t.locations}</span>
          {selected.length > 0 && <span className="font-mono text-xs text-accent-bright">{t.selected(selected.length)}</span>}
        </div>
        <p className="mt-1 text-xs text-fg-subtle">{t.locationsHint}</p>
        {selected.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {selected.map((slug) => {
              const o = options.find((x) => x.slug === slug);
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => setSelected((s) => s.filter((x) => x !== slug))}
                  className="chip border-accent/50 bg-accent-soft text-white hover:border-accent-bright"
                >
                  {o?.name ?? slug}
                  <X className="size-3" />
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-3 overflow-hidden rounded-2xl border border-border-strong bg-bg-2">
          <label className="flex items-center gap-2 border-b border-border px-4">
            <Search className="size-4 text-fg-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.locationsSearch}
              className="h-11 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-fg-subtle"
            />
          </label>
          <ul className="max-h-64 overflow-y-auto p-1.5" role="listbox" aria-multiselectable="true" aria-label={t.locations}>
            {filtered.map((o) => {
              const on = selected.includes(o.slug);
              return (
                <li key={o.slug}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => setSelected((s) => (on ? s.filter((x) => x !== o.slug) : [...s, o.slug]))}
                    className={clsx('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors', on ? 'bg-accent-soft' : 'hover:bg-white/5')}
                  >
                    <span className={clsx('flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border', on ? 'border-accent bg-accent' : 'border-border-strong')}>
                      {on && <span className="size-2 rounded-[2px] bg-white" />}
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm text-white">{o.name}</span>
                      <span className="block text-xs text-fg-subtle">{[o.region, o.cluster].filter(Boolean).join(' · ')}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {field(
        'message',
        t.message,
        <textarea id="f-message" className={cls('message')} rows={5} placeholder={t.messagePlaceholder} value={form.message} onChange={(e) => set('message', e.target.value)} maxLength={4000} />,
      )}

      <label className={clsx('flex cursor-pointer items-start gap-3 text-sm', invalid('consent') ? 'text-danger' : 'text-fg-muted')}>
        <input id="f-consent" type="checkbox" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} className="mt-0.5 size-[18px] accent-[var(--accent)]" />
        <span>
          {t.consent}{' '}
          <Link href={href(lang, '/privacy')} className="text-accent-bright underline underline-offset-4" target="_blank">
            {t.privacy}
          </Link>
          .
        </span>
      </label>

      {(error || fieldErrors.length > 0) && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-white">
          {error ?? t.required}
        </p>
      )}

      <button type="submit" disabled={sending} className="btn-primary h-12 w-full sm:w-auto sm:px-10">
        {sending && <Loader2 className="size-4 animate-spin" />}
        {sending ? t.sending : t.submit}
      </button>
    </form>
  );
}
