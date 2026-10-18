'use client';

import clsx from 'clsx';
import { Camera, ExternalLink, Plus, Search, Star } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Empty, Input, Loading, PageHeader } from '@/components/admin/ui';
import { fmtDate, useApi, type Paged } from '@/lib/admin';
import { PUBLISH_STATUS } from '@/lib/admin-labels';

interface Row {
  id: string;
  slug: string;
  status: string;
  nameEn: string;
  nameRu: string;
  regionEn: string | null;
  cluster: { id: string; nameEn: string } | null;
  featured: boolean;
  thumb: string | null;
  mediaCount: number;
  leadCount: number;
  updatedAt: string;
}

export default function LocationsAdminPage() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);
  const params = new URLSearchParams({ limit: '200', ...(status ? { status } : {}), ...(debounced ? { q: debounced } : {}) });
  const { data } = useApi<Paged<Row>>(`/admin/locations?${params}`);

  return (
    <div>
      <PageHeader
        title="Локации"
        subtitle="Каталог и технические паспорта. Опубликованные локации сразу видны на сайте и на карте."
        actions={
          <Link href="/admin/locations/new" className="btn-primary btn-sm">
            <Plus className="size-4" /> Новая локация
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full border border-border-strong p-1">
          {['', 'PUBLISHED', 'DRAFT', 'ARCHIVED'].map((s) => (
            <button
              key={s || 'all'}
              type="button"
              onClick={() => setStatus(s)}
              className={clsx('rounded-full px-3 py-1.5 text-[13px] font-medium', status === s ? 'bg-white text-black' : 'text-fg-muted hover:text-white')}
            >
              {s ? PUBLISH_STATUS[s].label : 'Все'}
            </button>
          ))}
        </div>
        <label className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название, регион, жанр" className="h-10 pl-10" />
        </label>
      </div>
      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <Empty title="Локаций нет" action={<Link href="/admin/locations/new" className="btn-primary btn-sm">Создать локацию</Link>} />
      ) : (
        <div className="card divide-y divide-border">
          {data.items.map((l) => (
            <div key={l.id} className="flex items-center gap-4 p-3 sm:p-4">
              <Link href={`/admin/locations/${l.id}`} className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-bg-2 sm:w-36">
                {l.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.thumb} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                ) : (
                  <span className="topo absolute inset-0" />
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/admin/locations/${l.id}`} className="flex items-center gap-2 font-medium text-white hover:text-accent-bright">
                  <span className="truncate">{l.nameEn}</span>
                  {l.featured && <Star className="size-3.5 shrink-0 fill-warning text-warning" />}
                </Link>
                <p className="truncate text-xs text-fg-muted">
                  {[l.nameRu, l.regionEn, l.cluster?.nameEn].filter(Boolean).join(' · ')}
                </p>
                <p className="mt-1 text-xs text-fg-subtle">
                  {l.mediaCount} медиа · {l.leadCount} заявок · изменена {fmtDate(l.updatedAt)}
                </p>
              </div>
              <Badge tone={PUBLISH_STATUS[l.status].tone}>{PUBLISH_STATUS[l.status].label}</Badge>
              <Link href={`/admin/photos/${l.id}`} className="flex size-9 items-center justify-center rounded-full text-fg-muted hover:bg-white/10 hover:text-white" aria-label="Фото и видео локации" title="Фото и видео локации">
                <Camera className="size-4" />
              </Link>
              {l.status === 'PUBLISHED' && (
                <a href={`/locations/${l.slug}`} target="_blank" className="hidden size-9 items-center justify-center rounded-full text-fg-muted hover:bg-white/10 hover:text-white sm:flex" aria-label="Открыть на сайте">
                  <ExternalLink className="size-4" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
