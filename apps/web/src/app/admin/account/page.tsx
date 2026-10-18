'use client';

import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { mutate } from 'swr';
import { useAdminUser } from '@/components/admin/shell';
import { Badge, Button, Card, errorText, Field, Input, PageHeader, useToast } from '@/components/admin/ui';
import { api } from '@/lib/admin';

export default function AccountPage() {
  const user = useAdminUser();
  const toast = useToast();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast('ok', ok);
      return true;
    } catch (e) {
      toast('error', errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Аккаунт" subtitle={`${user.name} · ${user.email}`} />
      <div className="space-y-6">
        <Card title="Двухфакторная аутентификация" actions={user.totpEnabledAt ? <Badge tone="green"><ShieldCheck className="size-3" /> Включена</Badge> : <Badge tone="yellow">Выключена</Badge>}>
          {user.totpEnabledAt ? (
            <div className="space-y-3">
              <p className="text-sm text-fg-muted">При входе нужен код из приложения. Чтобы выключить, введите текущий код.</p>
              <div className="flex gap-2">
                <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className="w-36 font-mono tracking-[0.3em]" />
                <Button loading={busy} onClick={async () => (await run(() => api.post('/auth/2fa/disable', { code }), '2FA выключена')) && (setCode(''), mutate('/auth/me'))}>
                  Выключить
                </Button>
              </div>
            </div>
          ) : setup ? (
            <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
              <div className="rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
              <div className="space-y-3">
                <p className="text-sm text-fg-muted">Отсканируйте QR-код в Google Authenticator, Aegis или 1Password, затем введите код из приложения.</p>
                <p className="font-mono text-xs break-all text-fg-subtle">Ключ: {setup.secret}</p>
                <div className="flex gap-2">
                  <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className="w-36 font-mono tracking-[0.3em]" />
                  <Button
                    variant="primary"
                    loading={busy}
                    onClick={async () => (await run(() => api.post('/auth/2fa/enable', { code }), '2FA включена')) && (setSetup(null), setCode(''), mutate('/auth/me'))}
                  >
                    Включить
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-fg-muted">Рекомендуем всем, у кого есть доступ к заявкам: даже при утечке пароля войти без телефона не получится.</p>
              <Button variant="primary" loading={busy} onClick={() => run(async () => setSetup(await api.post('/auth/2fa/setup')), 'Отсканируйте QR-код')}>
                Настроить
              </Button>
            </div>
          )}
        </Card>
        <Card title="Пароль">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Текущий пароль">
              <Input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" />
            </Field>
            <Field label="Новый пароль" hint="Не короче 10 символов. Другие сессии будут завершены.">
              <Input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" />
            </Field>
          </div>
          <Button className="mt-4" variant="primary" loading={busy} onClick={async () => (await run(() => api.post('/auth/password', pw), 'Пароль изменён')) && setPw({ currentPassword: '', newPassword: '' })}>
            Сменить пароль
          </Button>
        </Card>
      </div>
    </div>
  );
}
