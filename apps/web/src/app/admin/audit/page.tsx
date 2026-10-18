'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { Input, Loading, PageHeader } from '@/components/admin/ui';
import { fmtDate, useApi } from '@/lib/admin';

interface Event {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  actor: { id: string; name: string } | null;
}

const ACTIONS: Record<string, string> = {
  'auth.login': 'Вход',
  'auth.login_failed': 'Неудачный вход',
  'auth.logout': 'Выход',
  'auth.mfa_failed': 'Неверный код 2FA',
  'auth.2fa_enabled': '2FA включена',
  'auth.2fa_disabled': '2FA выключена',
  'auth.password_changed': 'Смена пароля',
  'lead.created': 'Новая заявка с сайта',
  'lead.updated': 'Заявка изменена',
  'lead.note': 'Заметка к заявке',
  'lead.deleted': 'Заявка удалена',
  'location.created': 'Локация создана',
  'location.updated': 'Локация изменена',
  'location.published': 'Локация опубликована',
  'location.draft': 'Локация в черновики',
  'location.archived': 'Локация в архив',
  'location.media_updated': 'Медиа локации изменены',
  'location.media_added': 'Фото добавлено к локации',
  'location.media_replaced': 'Фото локации заменено',
  'location.media_removed': 'Фото убрано с локации',
  'location.media_reordered': 'Порядок фото изменён',
  'location.cover_changed': 'Обложка локации изменена',
  'location.embeds_updated': 'Панорамы по коду изменены',
  'location.deleted': 'Локация удалена',
  'upload.started': 'Загрузка начата',
  'upload.completed': 'Файл загружен',
  'upload.aborted': 'Загрузка отменена',
  'asset.updated': 'Файл изменён',
  'asset.reprocess': 'Повторная обработка',
  'asset.deleted': 'Файл удалён',
  'settings.updated': 'Настройки изменены',
  'hero.updated': 'Главная изменена',
  'page.updated': 'Страница изменена',
  'user.created': 'Сотрудник добавлен',
  'user.updated': 'Сотрудник изменён',
  'user.deleted': 'Сотрудник удалён',
};

export default function AuditPage() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data } = useApi<{ items: Event[]; pages: number }>(`/admin/audit?page=${page}&limit=100${q ? `&q=${encodeURIComponent(q)}` : ''}`);
  return (
    <div>
      <PageHeader title="Журнал действий" subtitle="Кто и что менял в CMS. Записи нельзя изменить или удалить." />
      <Input value={q} onChange={(e) => (setQ(e.target.value.trim()), setPage(1))} placeholder="Фильтр по действию: lead, location, auth…" className="mb-4 h-10 max-w-sm" />
      {!data ? (
        <Loading />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap text-fg-subtle">{fmtDate(e.createdAt)}</td>
                  <td className="px-4 py-2.5 text-white">{ACTIONS[e.action] ?? e.action}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{e.actor?.name ?? (e.action.startsWith('lead.created') ? 'Посетитель сайта' : '—')}</td>
                  <td className="max-w-[360px] truncate px-4 py-2.5 font-mono text-[11px] text-fg-subtle">{e.meta ? JSON.stringify(e.meta) : ''}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-fg-subtle">{e.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.pages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          {Array.from({ length: Math.min(data.pages, 20) }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" onClick={() => setPage(n)} className={clsx('size-9 rounded-full font-mono text-sm', n === page ? 'bg-white text-black' : 'text-fg-muted hover:bg-white/10')}>
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
