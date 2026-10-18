'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Badge, Loading, PageHeader } from '@/components/admin/ui';
import { fmtDate, useApi } from '@/lib/admin';

const PATHS: Record<string, string> = { 'why-kazakhstan': '/why-kazakhstan', incentives: '/incentives', permits: '/permits', privacy: '/privacy' };

export default function PagesAdminPage() {
  const { data } = useApi<{ items: { id: string; slug: string; titleEn: string; titleRu: string; published: boolean; updatedAt: string }[] }>('/admin/pages');
  if (!data) return <Loading />;
  return (
    <div>
      <PageHeader title="Страницы" subtitle="«Почему Казахстан», Cash rebate, разрешения и политика конфиденциальности. Текст — в Markdown." />
      <div className="card divide-y divide-border">
        {data.items.map((p) => (
          <div key={p.id} className="flex items-center gap-4 p-4">
            <Link href={`/admin/pages/${p.slug}`} className="min-w-0 flex-1">
              <p className="font-medium text-white hover:text-accent-bright">{p.titleRu || p.titleEn}</p>
              <p className="text-xs text-fg-muted">
                {p.titleEn} · изменена {fmtDate(p.updatedAt)}
              </p>
            </Link>
            <Badge tone={p.published ? 'green' : 'gray'}>{p.published ? 'Опубликована' : 'Скрыта'}</Badge>
            {PATHS[p.slug] && (
              <a href={PATHS[p.slug]} target="_blank" className="flex size-9 items-center justify-center rounded-full text-fg-muted hover:bg-white/10" aria-label="Открыть">
                <ExternalLink className="size-4" />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
