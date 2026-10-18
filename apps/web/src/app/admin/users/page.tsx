'use client';

import { Plus, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useAdminUser } from '@/components/admin/shell';
import { Badge, Button, errorText, Field, Input, Loading, Modal, PageHeader, Select, Toggle, useToast } from '@/components/admin/ui';
import { api, fmtDate, useApi } from '@/lib/admin';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'EDITOR';
  blockedAt: string | null;
  totpEnabledAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLES = [
  { value: 'EDITOR', label: 'Редактор — локации, медиа, страницы, заявки' },
  { value: 'ADMIN', label: 'Администратор — всё, включая команду и настройки' },
];

export default function UsersPage() {
  const me = useAdminUser();
  const toast = useToast();
  const { data, mutate } = useApi<{ items: User[] }>('/admin/users');
  const [create, setCreate] = useState<{ email: string; name: string; password: string; role: string } | null>(null);
  const [edit, setEdit] = useState<(User & { password: string; reset2fa: boolean; blocked: boolean }) | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return <Loading />;

  const run = async (fn: () => Promise<unknown>, done: () => void) => {
    setBusy(true);
    try {
      await fn();
      await mutate();
      done();
      toast('ok', 'Сохранено');
    } catch (e) {
      toast('error', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Команда"
        subtitle="Доступ в CMS. Регистрации с сайта нет — сотрудников добавляет администратор."
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreate({ email: '', name: '', password: '', role: 'EDITOR' })}>
            <Plus className="size-4" /> Сотрудник
          </Button>
        }
      />
      <div className="card divide-y divide-border">
        {data.items.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => setEdit({ ...u, password: '', reset2fa: false, blocked: !!u.blockedAt })}
            className="flex w-full flex-wrap items-center gap-3 p-4 text-left hover:bg-white/[0.03]"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-bright">{u.name[0]}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-white">
                {u.name} {u.id === me.id && <span className="text-xs text-fg-subtle">(вы)</span>}
              </span>
              <span className="block text-xs text-fg-muted">
                {u.email} · вход {fmtDate(u.lastLoginAt)}
              </span>
            </span>
            {u.totpEnabledAt && (
              <Badge tone="green">
                <ShieldCheck className="size-3" /> 2FA
              </Badge>
            )}
            <Badge tone={u.role === 'ADMIN' ? 'blue' : 'gray'}>{u.role === 'ADMIN' ? 'Администратор' : 'Редактор'}</Badge>
            {u.blockedAt && <Badge tone="red">Заблокирован</Badge>}
          </button>
        ))}
      </div>

      <Modal open={!!create} onClose={() => setCreate(null)} title="Новый сотрудник">
        {create && (
          <div className="space-y-4">
            <Field label="Имя">
              <Input value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={create.email} onChange={(e) => setCreate({ ...create, email: e.target.value })} />
            </Field>
            <Field label="Временный пароль" hint="Не короче 10 символов. Передайте сотруднику — он сменит его в «Аккаунте».">
              <Input value={create.password} onChange={(e) => setCreate({ ...create, password: e.target.value })} />
            </Field>
            <Field label="Роль">
              <Select value={create.role} onChange={(e) => setCreate({ ...create, role: e.target.value })} options={ROLES} />
            </Field>
            <Button variant="primary" loading={busy} onClick={() => run(() => api.post('/admin/users', create), () => setCreate(null))}>
              Добавить
            </Button>
          </div>
        )}
      </Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.name ?? ''}>
        {edit && (
          <div className="space-y-4">
            <Field label="Имя">
              <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label="Роль">
              <Select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as User['role'] })} options={ROLES} />
            </Field>
            <Field label="Новый пароль" hint="Оставьте пустым, чтобы не менять. Смена пароля завершает все сессии сотрудника.">
              <Input value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
            </Field>
            {edit.totpEnabledAt && <Toggle checked={edit.reset2fa} onChange={(v) => setEdit({ ...edit, reset2fa: v })} label="Сбросить 2FA (потерян телефон)" />}
            <Toggle checked={edit.blocked} onChange={(v) => setEdit({ ...edit, blocked: v })} label="Заблокировать доступ" />
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                variant="primary"
                loading={busy}
                onClick={() =>
                  run(
                    () =>
                      api.patch(`/admin/users/${edit.id}`, {
                        name: edit.name,
                        role: edit.role,
                        blocked: edit.blocked,
                        ...(edit.password ? { password: edit.password } : {}),
                        ...(edit.reset2fa ? { reset2fa: true } : {}),
                      }),
                    () => setEdit(null),
                  )
                }
              >
                Сохранить
              </Button>
              {edit.id !== me.id && (
                <Button
                  variant="danger"
                  onClick={() => confirm(`Удалить ${edit.name}?`) && run(() => api.del(`/admin/users/${edit.id}`), () => setEdit(null))}
                >
                  Удалить
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
