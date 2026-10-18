'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button, errorText, Field, Input } from '@/components/admin/ui';
import { Logo } from '@/components/site/logo';
import { api } from '@/lib/admin';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next')?.startsWith('/admin') ? params.get('next')! : '/admin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mfaToken) {
        await api.post('/auth/login/mfa', { mfaToken, code });
        router.replace(next);
        return;
      }
      const res = await api.post<{ mfaRequired?: boolean; mfaToken?: string }>('/auth/login', { email, password });
      if (res.mfaRequired && res.mfaToken) setMfaToken(res.mfaToken);
      else router.replace(next);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card w-full max-w-sm space-y-5 p-7">
      <div>
        <Logo />
        <h1 className="display mt-6 text-2xl text-white">{mfaToken ? 'Код из приложения' : 'Вход в CMS'}</h1>
        <p className="mt-1 text-sm text-fg-muted">{mfaToken ? 'Введите 6 цифр из Google Authenticator, Aegis или 1Password.' : 'Для команды локаций LOCI360.'}</p>
      </div>
      {mfaToken ? (
        <Field label="Код">
          <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus className="text-center font-mono text-lg tracking-[0.4em]" />
        </Field>
      ) : (
        <>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus required />
          </Field>
          <Field label="Пароль">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
        </>
      )}
      {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <Button type="submit" variant="primary" loading={busy} className="w-full">
        {mfaToken ? 'Подтвердить' : 'Войти'}
      </Button>
      {mfaToken && (
        <button type="button" onClick={() => setMfaToken(null)} className="w-full text-center text-xs text-fg-subtle hover:text-white">
          ← Другой аккаунт
        </button>
      )}
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(80%_60%_at_50%_0%,rgba(230,30,50,.22),transparent_70%)] p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
