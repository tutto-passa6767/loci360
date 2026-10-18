'use client';

import { useParams } from 'next/navigation';
import { dict } from '@/lib/i18n';

/** Shown when the API is unreachable or answers with an error */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const { lang } = useParams<{ lang: string }>();
  const t = dict(lang === 'ru' ? 'ru' : 'en').error;
  return (
    <section className="container-x flex min-h-[70vh] flex-col items-start justify-center pt-[var(--header-h)]">
      <p className="tag">503</p>
      <h1 className="display mt-3 text-4xl text-white sm:text-5xl">{t.title}</h1>
      <p className="mt-4 max-w-md text-fg-muted">{t.text}</p>
      <button type="button" onClick={reset} className="btn-light mt-8">
        {t.retry}
      </button>
    </section>
  );
}
