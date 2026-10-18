'use client';

import clsx from 'clsx';
import { Check, Download, Film, Image as ImageIcon, Orbit, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { mutate as globalMutate, type KeyedMutator } from 'swr';
import { VideoPlayer } from '@/components/location/video-player';
import { api, fmtDate, fmtDuration, fmtSize, useApi, type AdminAsset, type Paged } from '@/lib/admin';
import { ASSET_KIND, ASSET_STATE } from '@/lib/admin-labels';
import { Badge, Button, Empty, errorText, Field, Input, Loading, Modal, Toggle, useToast } from './ui';
import { Uploader } from './uploader';

const KIND_ICON = { VIDEO: Film, PHOTO: ImageIcon, PANORAMA: Orbit } as const;

/** Refresh every cached list of assets (after uploads, edits, deletes) */
export const refreshAssets = () => globalMutate((key) => typeof key === 'string' && key.startsWith('/admin/assets'));

export function AssetThumb({ asset, className }: { asset: Pick<AdminAsset, 'thumb' | 'blur' | 'kind' | 'state' | 'progress'>; className?: string }) {
  const Icon = KIND_ICON[asset.kind];
  return (
    <div className={clsx('relative overflow-hidden bg-bg-2', className)} style={asset.blur ? { backgroundImage: `url(${asset.blur})`, backgroundSize: 'cover' } : undefined}>
      {asset.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.thumb} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="topo absolute inset-0 flex items-center justify-center">
          <Icon className="size-6 text-white/40" />
        </div>
      )}
      {(asset.state === 'RUNNING' || asset.state === 'PENDING') && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
          <div className="h-full bg-accent-bright transition-[width]" style={{ width: `${asset.state === 'PENDING' ? 2 : asset.progress}%` }} />
        </div>
      )}
    </div>
  );
}

/** Edit dialog: preview, credit and alt texts, watermark, reprocess, original download, delete */
type AssetDetail = AdminAsset & { meta: Record<string, unknown> | null; usedIn: { id: string; nameEn: string; slug: string; role: string }[]; originalUrl: string | null };

export function AssetDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, mutate } = useApi<AssetDetail>(id ? `/admin/assets/${id}` : null, {
    refreshInterval: (d) => (d && (d.state === 'PENDING' || d.state === 'RUNNING') ? 3000 : 0),
  });
  return (
    <Modal open={!!id} onClose={onClose} title={data?.title ?? 'Файл'} wide>
      {!data ? <Loading /> : <AssetDialogBody key={data.id} data={data} mutate={mutate} onClose={onClose} />}
    </Modal>
  );
}

function AssetDialogBody({ data, mutate, onClose }: { data: AssetDetail; mutate: KeyedMutator<AssetDetail>; onClose: () => void }) {
  const toast = useToast();
  const id = data.id;
  const [form, setForm] = useState({ title: data.title, credit: data.credit ?? '', altEn: data.altEn ?? '', altRu: data.altRu ?? '', watermark: data.watermark });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await mutate(await api.patch(`/admin/assets/${id}`, form), { revalidate: false });
      await refreshAssets();
      toast('ok', data?.kind === 'VIDEO' && form.watermark !== data.watermark ? 'Сохранено — видео перекодируется' : 'Сохранено');
    } catch (e) {
      toast('error', errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const reprocess = async () => {
    try {
      await mutate(await api.post(`/admin/assets/${id}/reprocess`), { revalidate: false });
      await refreshAssets();
      toast('ok', 'Файл отправлен на повторную обработку');
    } catch (e) {
      toast('error', errorText(e));
    }
  };
  const remove = async () => {
    const used = data?.usedIn.length ? `\nФайл используется в локациях: ${data.usedIn.map((u) => u.nameEn).join(', ')} — он исчезнет и оттуда.` : '';
    if (!confirm(`Удалить «${data?.title}» и все его версии?${used}`)) return;
    try {
      await api.del(`/admin/assets/${id}`);
      await refreshAssets();
      onClose();
    } catch (e) {
      toast('error', errorText(e));
    }
  };

  return (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3">
            {data.kind === 'VIDEO' && data.hls ? (
              <VideoPlayer
                lang="ru"
                video={{
                  id: data.id,
                  hls: data.hls,
                  poster: { src: data.thumb ?? '', srcSet: '', width: 0, height: 0, blur: data.blur, color: null, alt: '', credit: null },
                  loop: null,
                  preview: data.preview,
                  sprite: null,
                  durationSec: data.durationSec,
                  width: data.width,
                  height: data.height,
                  qualities: [],
                  credit: null,
                }}
                className="rounded-xl"
              />
            ) : (
              <AssetThumb asset={data} className="aspect-video rounded-xl" />
            )}
            <div className="flex flex-wrap gap-2">
              <Badge tone={ASSET_STATE[data.state].tone}>
                {ASSET_STATE[data.state].label}
                {data.state === 'RUNNING' ? ` · ${data.progress}%` : ''}
              </Badge>
              <Badge>{ASSET_KIND[data.kind]}</Badge>
              {data.width && (
                <Badge>
                  {data.width}×{data.height}
                </Badge>
              )}
              {data.durationSec ? <Badge>{fmtDuration(data.durationSec)}</Badge> : null}
              <Badge>{fmtSize(data.size)}</Badge>
            </div>
            {data.error && <p className="rounded-xl bg-danger-soft p-3 font-mono text-xs break-words text-danger">{data.error}</p>}
            <p className="text-xs text-fg-subtle">
              {data.originalName} · загружен {fmtDate(data.createdAt)}
              {data.processedAt ? ` · обработан ${fmtDate(data.processedAt)}` : ''}
            </p>
            {data.usedIn.length > 0 && (
              <p className="text-xs text-fg-muted">
                Используется: {data.usedIn.map((u) => u.nameEn).join(', ')}
              </p>
            )}
          </div>
          <div className="space-y-4">
            <Field label="Название в медиатеке">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Автор / лицензия" hint="Показывается под медиа на сайте, например «© Иван Петров» или «Wikimedia Commons, CC BY-SA 4.0»">
              <Input value={form.credit} onChange={(e) => setForm({ ...form, credit: e.target.value })} />
            </Field>
            <Field label="Описание для незрячих и SEO (EN)">
              <Input value={form.altEn} onChange={(e) => setForm({ ...form, altEn: e.target.value })} />
            </Field>
            <Field label="Описание (RU)">
              <Input value={form.altRu} onChange={(e) => setForm({ ...form, altRu: e.target.value })} />
            </Field>
            {data.kind === 'VIDEO' && <Toggle checked={form.watermark} onChange={(v) => setForm({ ...form, watermark: v })} label="Водяной знак LOCI360 (смена — перекодирование)" />}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="primary" onClick={save} loading={busy}>
                Сохранить
              </Button>
              <Button onClick={reprocess} disabled={data.state === 'PENDING' || data.state === 'RUNNING'}>
                <RefreshCw className="size-4" /> Обработать заново
              </Button>
              {data.originalUrl && (
                <a href={data.originalUrl} className="btn-ghost">
                  <Download className="size-4" /> Оригинал
                </a>
              )}
              <Button variant="danger" onClick={remove}>
                <Trash2 className="size-4" /> Удалить
              </Button>
            </div>
          </div>
        </div>
  );
}

/** Library browser: in the media page it opens files, in pickers it selects them */
export function AssetBrowser({
  kind,
  onOpen,
  selectable,
  selected = [],
  onToggle,
}: {
  kind?: AdminAsset['kind'] | AdminAsset['kind'][];
  onOpen?: (a: AdminAsset) => void;
  selectable?: boolean;
  selected?: string[];
  onToggle?: (a: AdminAsset) => void;
}) {
  const kinds = Array.isArray(kind) ? kind : kind ? [kind] : [];
  const [tab, setTab] = useState<string>(kinds.length === 1 ? kinds[0] : '');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);
  const params = new URLSearchParams({ limit: '120', ...(tab ? { kind: tab } : {}), ...(debounced ? { q: debounced } : {}), ...(stateFilter ? { state: stateFilter } : {}) });
  const { data } = useApi<Paged<AdminAsset>>(`/admin/assets?${params}`, {
    refreshInterval: (d) => (d?.items.some((a) => a.state === 'PENDING' || a.state === 'RUNNING') ? 3000 : 0),
  });
  const tabs = kinds.length > 1 ? kinds : kinds.length === 1 ? [] : (['VIDEO', 'PHOTO', 'PANORAMA'] as const);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {tabs.length > 0 && (
          <div className="flex gap-1 rounded-full border border-border-strong p-1">
            {['', ...tabs].map((k) => (
              <button
                key={k || 'all'}
                type="button"
                onClick={() => setTab(k)}
                className={clsx('rounded-full px-3 py-1.5 text-[13px] font-medium', tab === k ? 'bg-white text-black' : 'text-fg-muted hover:text-white')}
              >
                {k ? ASSET_KIND[k] : 'Все'}
              </button>
            ))}
          </div>
        )}
        {!selectable && (
          <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className="input h-10 w-auto rounded-full text-[13px]">
            <option value="">Любой статус</option>
            {['READY', 'RUNNING', 'PENDING', 'FAILED'].map((s) => (
              <option key={s} value={s}>
                {ASSET_STATE[s].label}
              </option>
            ))}
          </select>
        )}
        <label className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по названию" className="h-10 pl-10" />
        </label>
      </div>
      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <Empty title="Файлов нет" text="Загрузите видео или фото — они появятся здесь после обработки." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {data.items.map((a) => {
            const on = selected.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => (selectable ? onToggle?.(a) : onOpen?.(a))}
                className={clsx('group overflow-hidden rounded-xl border text-left transition-colors', on ? 'border-accent-bright ring-2 ring-accent-soft' : 'border-border hover:border-white/25')}
              >
                <div className="relative">
                  <AssetThumb asset={a} className="aspect-video" />
                  {selectable && (
                    <span className={clsx('absolute top-2 right-2 flex size-6 items-center justify-center rounded-full border', on ? 'border-accent bg-accent' : 'border-white/50 bg-black/40')}>
                      {on && <Check className="size-3.5 text-white" strokeWidth={3} />}
                    </span>
                  )}
                  {a.durationSec ? <span className="absolute right-2 bottom-2 rounded bg-black/70 px-1.5 font-mono text-[10px] text-white">{fmtDuration(a.durationSec)}</span> : null}
                </div>
                <div className="space-y-1 p-2.5">
                  <p className="truncate text-[13px] font-medium text-white">{a.title}</p>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge tone={ASSET_STATE[a.state].tone}>
                      {ASSET_STATE[a.state].label}
                      {a.state === 'RUNNING' ? ` ${a.progress}%` : ''}
                    </Badge>
                    <span className="text-[11px] text-fg-subtle">{ASSET_KIND[a.kind]}</span>
                    {!!a.usage && <span className="text-[11px] text-fg-subtle">· в {a.usage} лок.</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Modal to choose one or several files from the library (with an upload area) */
export function AssetPicker({
  open,
  onClose,
  kind,
  multiple,
  onPick,
  title = 'Выбор из медиатеки',
}: {
  open: boolean;
  onClose: () => void;
  kind?: AdminAsset['kind'] | AdminAsset['kind'][];
  multiple?: boolean;
  onPick: (assets: AdminAsset[]) => void;
  title?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      <PickerBody kind={kind} multiple={multiple} onPick={onPick} onClose={onClose} />
    </Modal>
  );
}

function PickerBody({
  kind,
  multiple,
  onPick,
  onClose,
}: {
  kind?: AdminAsset['kind'] | AdminAsset['kind'][];
  multiple?: boolean;
  onPick: (assets: AdminAsset[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<AdminAsset[]>([]);
  const [upload, setUpload] = useState(false);
  const toggle = (a: AdminAsset) => {
    if (!multiple) {
      onPick([a]);
      onClose();
      return;
    }
    setPicked((p) => (p.some((x) => x.id === a.id) ? p.filter((x) => x.id !== a.id) : [...p, a]));
  };
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setUpload((v) => !v)}>
          {upload ? 'Скрыть загрузку' : 'Загрузить новые файлы'}
        </Button>
      </div>
      {upload && (
        <div className="mb-6">
          <Uploader compact defaultPanorama={kind === 'PANORAMA'} />
        </div>
      )}
      <AssetBrowser kind={kind} selectable selected={picked.map((p) => p.id)} onToggle={toggle} />
      {multiple && (
        <div className="sticky bottom-0 mt-5 flex items-center justify-end gap-3 border-t border-border bg-surface pt-4">
          <span className="text-sm text-fg-muted">Выбрано: {picked.length}</span>
          <Button
            variant="primary"
            disabled={!picked.length}
            onClick={() => {
              onPick(picked);
              onClose();
            }}
          >
            Добавить
          </Button>
        </div>
      )}
    </>
  );
}
