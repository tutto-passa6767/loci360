'use client';

import { ArrowRight, Images, Inbox, MapPinned, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useAdminUser } from '@/components/admin/shell';
import { Badge, Card, Empty, Loading, PageHeader } from '@/components/admin/ui';
import { fmtDate, useApi } from '@/lib/admin';
import { countryName, LEAD_STATUS, PROJECT_TYPE } from '@/lib/admin-labels';

interface Dashboard {
  locations: Record<string, number>;
  leads: Record<string, number>;
  newThisWeek: number;
  media: { processing: number; failed: number };
  recentLeads: { id: string; number: number; name: string; company: string; country: string; status: string; createdAt: string; projectType: string }[];
  topLocations: { id?: string; nameEn?: string; slug?: string; requests: number }[];
}

export default function DashboardPage() {
  const user = useAdminUser();
  const { data } = useApi<Dashboard>('/admin/dashboard', { refreshInterval: 30_000 });
  if (!data) return <Loading />;
  const open = (data.leads.NEW ?? 0) + (data.leads.IN_PROGRESS ?? 0) + (data.leads.PROPOSAL ?? 0);

  const tiles = [
    { label: 'Новые заявки', value: data.leads.NEW ?? 0, hint: `${data.newThisWeek} за 7 дней`, href: '/admin/leads?status=NEW', icon: Inbox },
    { label: 'Заявки в работе', value: open, hint: 'новые, в работе и с предложением', href: '/admin/leads', icon: Inbox },
    { label: 'Опубликовано локаций', value: data.locations.PUBLISHED ?? 0, hint: `${data.locations.DRAFT ?? 0} в черновиках`, href: '/admin/locations', icon: MapPinned },
    {
      label: 'Медиа в обработке',
      value: data.media.processing,
      hint: data.media.failed ? `${data.media.failed} с ошибкой` : 'ошибок нет',
      href: data.media.failed ? '/admin/media?state=FAILED' : '/admin/media',
      icon: data.media.failed ? TriangleAlert : Images,
    },
  ];

  return (
    <div>
      <PageHeader title={`Здравствуйте, ${user.name.split(' ')[0]}`} subtitle="Сводка по заявкам, каталогу и медиа" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="card group p-5 transition-colors hover:border-white/20">
            <div className="flex items-center justify-between text-fg-muted">
              <span className="text-sm">{t.label}</span>
              <t.icon className="size-4 text-accent-bright" />
            </div>
            <p className="display mt-3 text-4xl text-white">{t.value}</p>
            <p className="mt-1 text-xs text-fg-subtle">{t.hint}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card
          title="Открытые заявки"
          actions={
            <Link href="/admin/leads" className="inline-flex items-center gap-1 text-sm text-accent-bright hover:text-white">
              Все заявки <ArrowRight className="size-4" />
            </Link>
          }
        >
          {data.recentLeads.length === 0 ? (
            <Empty title="Открытых заявок нет" text="Новые заявки с сайта появятся здесь и придут на почту команды." />
          ) : (
            <ul className="divide-y divide-border">
              {data.recentLeads.map((l) => (
                <li key={l.id}>
                  <Link href={`/admin/leads/${l.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:text-white">
                    <span className="font-mono text-xs text-fg-subtle">#{l.number}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-white">{l.company}</span>
                      <span className="block truncate text-xs text-fg-muted">
                        {l.name} · {countryName(l.country)} · {PROJECT_TYPE[l.projectType]}
                      </span>
                    </span>
                    <Badge tone={LEAD_STATUS[l.status]?.tone}>{LEAD_STATUS[l.status]?.label}</Badge>
                    <span className="w-28 text-right text-xs text-fg-subtle">{fmtDate(l.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Чаще всего запрашивают">
          {data.topLocations.length === 0 ? (
            <p className="text-sm text-fg-muted">Пока нет заявок с выбранными локациями.</p>
          ) : (
            <ol className="space-y-3">
              {data.topLocations.map((t, i) => (
                <li key={t.id ?? i} className="flex items-center gap-3">
                  <span className="font-mono text-xs text-fg-subtle">0{i + 1}</span>
                  <Link href={`/admin/locations/${t.id}`} className="min-w-0 flex-1 truncate text-sm text-white hover:text-accent-bright">
                    {t.nameEn}
                  </Link>
                  <Badge tone="blue">{t.requests}</Badge>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
