'use client';

import { Check } from 'lucide-react';
import { useState } from 'react';
import { apiFetch } from '@/lib/client-api';
import { dict } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

export function Unsubscribe({ lang, token }: { lang: Lang; token: string }) {
  const t = dict(lang).unsubscribe;
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>(TOKEN.test(token) ? 'idle' : 'error');

  const go = async () => {
    setState('busy');
    try {
      await apiFetch('/public/unsubscribe', { method: 'POST', body: { token } });
      setState('done');
    } catch {
      setState('error');
    }
  };

  if (state === 'done')
    return (
      <p role="status" className="mt-8 flex items-center gap-2 text-success">
        <Check className="size-5" /> {t.done}
      </p>
    );
  if (state === 'error')
    return (
      <p role="alert" className="mt-8 text-danger">
        {t.invalid}
      </p>
    );
  return (
    <button type="button" onClick={go} disabled={state === 'busy'} className="btn-primary mt-8 h-12 px-6">
      {t.button}
    </button>
  );
}
