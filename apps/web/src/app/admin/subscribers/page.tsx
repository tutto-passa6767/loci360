'use client';

import { Download, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAdminUser } from '@/components/admin/shell';
import { Badge, Button, Card, Empty, errorText, Loading, PageHeader, useToast } from '@/components/admin/ui';
import { api, fmtDate, useApi } from '@/lib/admin';

interface Subscriber {
  id: string;
  email: string;
  locale: string;
  sourcePath: string | null;
  createdAt: string;
  unsubscribedAt: string | null;
}
interface List {
  items: Subscriber[];
  total: number;
  active: number;
  page: number;
  pages: number;
}

/** Newsletter sign-ups from the site footer; the CSV holds active addresses with their personal unsubscribe links */
export default function SubscribersPage() {
  const me = useAdminUser();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), ...(search.trim() ? { search: search.trim() } : {}) });
  const { data, mutate } = useApi<List>(`/admin/subscribers?${qs}`, { keepPreviousData: true });

  const remove = async (s: Subscriber) => {
    if (!window.confirm(`Удалить ${s.email} из списка? Адрес исчезнет без следа (например, по запросу на удаление данных).`)) return;
    try {
      await api.del(`/admin/subscribers/${s.id}`);
      await mutate();
      toast('ok', 'Удалено');
    } catch (e) {
      toast('error', errorText(e));
    }
  };

  return (
    <div>
      <PageHeader
        title="Подписчики"
        subtitle={data ? `Активных: ${data.active} · всего в списке: ${data.total}. Подписка — в подвале сайта; в каждом письме есть ссылка для отписки.` : undefined}
        actions={
          <a href="/api/admin/subscribers/export.csv" className="btn-ghost btn-sm">
            <Download className="size-4" /> CSV для рассылки
          </a>
        }
      />
      <Card>
        <label className="mb-4 flex h-11 items-center gap-2 rounded-xl border border-border px-3 focus-within:border-border-strong">
          <Search className="size-4 text-fg-subtle" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Поиск по email"
            className="h-full flex-1 bg-transparent text-sm text-white outline-none"
          />
        </label>
        {!data ? (
          <Loading />
        ) : data.items.length === 0 ? (
          <Empty title="Пока никого" text="Подписки появятся, когда посетители оставят email в подвале сайта." />
        ) : (
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-fg-subtle">
                <tr>
                  <th className="px-5 py-2 font-medium sm:px-6">Email</th>
                  <th className="px-3 py-2 font-medium">Язык</th>
                  <th className="px-3 py-2 font-medium">Откуда</th>
                  <th className="px-3 py-2 font-medium">Подписка</th>
                  <th className="px-3 py-2 font-medium">Статус</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((s) => (
                  <tr key={s.id}>
                    <td className="px-5 py-2.5 text-white sm:px-6">{s.email}</td>
                    <td className="px-3 py-2.5 text-fg-muted uppercase">{s.locale}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-fg-subtle">{s.sourcePath ?? '—'}</td>
                    <td className="px-3 py-2.5 text-fg-muted">{fmtDate(s.createdAt, false)}</td>
                    <td className="px-3 py-2.5">{s.unsubscribedAt ? <Badge>Отписан {fmtDate(s.unsubscribedAt, false)}</Badge> : <Badge tone="green">Активен</Badge>}</td>
                    <td className="px-3 py-2.5 text-right">
                      {me.role === 'ADMIN' && (
                        <button type="button" onClick={() => remove(s)} className="rounded-lg p-2 text-fg-subtle hover:bg-white/5 hover:text-danger" aria-label={`Удалить ${s.email}`}>
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.pages > 1 && (
          <div className="mt-4 flex items-center justify-end gap-2 text-sm text-fg-muted">
            <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Назад
            </Button>
            {page} / {data.pages}
            <Button size="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
              Дальше
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
