'use client';

import clsx from 'clsx';
import { ImageOff, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Empty, Input, Loading, PageHeader } from '@/components/admin/ui';
import { useApi, type Paged } from '@/lib/admin';
import { PUBLISH_STATUS } from '@/lib/admin-labels';

interface Row {
  id: string;
  status: string;
  nameEn: string;
  nameRu: string;
  cluster: { id: string; nameEn: string } | null;
  thumb: string | null;
  photos: { count: number; panoramas: number; showreels: number; broll: number; processing: number; failed: number; small: number };
}

/** Fewer gallery photos than this looks thin on a location page */
const FEW_PHOTOS = 4;

const problems = (r: Row) => !r.thumb || !r.photos.showreels || r.photos.failed > 0 || r.photos.small > 0 || r.photos.count < FEW_PHOTOS;

export default function PhotosAdminPage() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [onlyProblems, setOnlyProblems] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);
  const params = new URLSearchParams({ limit: '200', ...(debounced ? { q: debounced } : {}) });
  const { data } = useApi<Paged<Row>>(`/admin/locations?${params}`, {
    refreshInterval: (d) => (d?.items.some((r) => r.photos.processing > 0) ? 4000 : 0),
  });
  const rows = (data?.items ?? []).filter((r) => !onlyProblems || problems(r)).sort((a, b) => a.nameEn.localeCompare(b.nameEn));

  return (
    <div>
      <PageHeader
        title="Фото и видео локаций"
        subtitle="Выберите локацию, чтобы поменять обложку, шоурил или фото: добавить, заменить, убрать. Всё сохраняется сразу."
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full border border-border-strong p-1">
          {[
            [false, 'Все'],
            [true, 'Требуют внимания'],
          ].map(([v, label]) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setOnlyProblems(v as boolean)}
              className={clsx('rounded-full px-3 py-1.5 text-[13px] font-medium', onlyProblems === v ? 'bg-white text-black' : 'text-fg-muted hover:text-white')}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название или регион" className="h-10 pl-10" />
        </label>
      </div>
      {!data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty title={onlyProblems ? 'Всё в порядке' : 'Локаций не найдено'} text={onlyProblems ? 'У каждой локации есть обложка, шоурил и достаточно чётких фото.' : undefined} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {rows.map((r) => (
            <Link key={r.id} href={`/admin/photos/${r.id}`} className="card group overflow-hidden transition-colors hover:border-white/25">
              <div className="relative aspect-[3/2] bg-bg-2">
                {r.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.thumb} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                ) : (
                  <div className="topo absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-fg-muted">
                    <ImageOff className="size-6" /> Нет обложки
                  </div>
                )}
                {r.status !== 'PUBLISHED' && (
                  <span className="absolute top-2 left-2">
                    <Badge tone={PUBLISH_STATUS[r.status].tone}>{PUBLISH_STATUS[r.status].label}</Badge>
                  </span>
                )}
              </div>
              <div className="space-y-2 p-3.5">
                <div className="min-w-0">
                  <p className="truncate font-medium text-white group-hover:text-accent-bright">{r.nameEn}</p>
                  <p className="truncate text-xs text-fg-muted">{[r.nameRu, r.cluster?.nameEn].filter(Boolean).join(' · ')}</p>
                </div>
                <p className="text-xs text-fg-subtle">
                  {[`${r.photos.count} фото`, r.photos.showreels && `шоурил: ${r.photos.showreels}`, r.photos.broll && `B-roll: ${r.photos.broll}`, r.photos.panoramas && `360°: ${r.photos.panoramas}`].filter(Boolean).join(' · ')}
                </p>
                {problems(r) || r.photos.processing ? (
                  <div className="flex flex-wrap gap-1">
                    {!r.thumb && <Badge tone="red">Нет обложки</Badge>}
                    {!r.photos.showreels && <Badge tone="yellow">Нет шоурила</Badge>}
                    {r.photos.failed > 0 && <Badge tone="red">Ошибка обработки: {r.photos.failed}</Badge>}
                    {r.photos.processing > 0 && <Badge tone="blue">Обрабатывается: {r.photos.processing}</Badge>}
                    {r.photos.count < FEW_PHOTOS && <Badge tone="yellow">Мало фото</Badge>}
                    {r.photos.small > 0 && <Badge tone="yellow">Нечётких: {r.photos.small}</Badge>}
                  </div>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
