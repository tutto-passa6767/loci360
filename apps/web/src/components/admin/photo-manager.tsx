'use client';

import clsx from 'clsx';
import { ArrowLeft, ArrowRight, CloudUpload, ExternalLink, Film, House, ImageOff, ImagePlus, Images, PenLine, Repeat2, Star, Trash2, TriangleAlert, X } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { api, fmtDuration, useApi, type AdminAsset } from '@/lib/admin';
import { ASSET_STATE, options, PUBLISH_STATUS, TIME_OF_DAY } from '@/lib/admin-labels';
import { AssetDialog, AssetPicker, AssetThumb } from './assets';
import { Badge, Button, errorText, Input, Loading, Spinner, Toggle, useToast } from './ui';
import { useUploads, type UploadItem } from './uploader';

type Role = 'SHOWREEL' | 'BROLL' | 'PHOTO' | 'PANORAMA';
type Kind = AdminAsset['kind'];

interface MediaItem {
  assetId: string;
  role: Role;
  timeOfDay: string | null;
  labelEn: string | null;
  labelRu: string | null;
  asset: AdminAsset;
  /** Home-page hero moods that play this video */
  onHome?: string[];
}

interface Loc {
  id: string;
  slug: string;
  status: string;
  nameEn: string;
  nameRu: string;
  coverAssetId: string | null;
  cover: AdminAsset | null;
  media: MediaItem[];
}

/** What the file dialog is open for */
type Target = { role: Role; multiple: boolean; replace?: string; cover?: boolean };

const KIND: Record<Role, Kind> = { SHOWREEL: 'VIDEO', BROLL: 'VIDEO', PHOTO: 'PHOTO', PANORAMA: 'PANORAMA' };
const EXT = {
  still: { re: /\.(jpe?g|png|webp|tiff?|heic|heif)$/i, accept: 'image/*,.heic,.heif,.tif,.tiff', refuse: 'Это не фото', formats: 'JPEG, PNG, WebP, HEIC, TIFF' },
  video: { re: /\.(mp4|mov|m4v|mkv|mxf|avi|webm)$/i, accept: 'video/*,.mxf,.mov,.mkv,.m4v', refuse: 'Это не видео', formats: 'MP4, MOV, MXF, MKV, WebM' },
};
const extFor = (role: Role) => (KIND[role] === 'VIDEO' ? EXT.video : EXT.still);

/** Same threshold as the API's SMALL_PHOTO_PX: a shorter side below it looks soft in the full-width page header */
export const SMALL_PX = 1200;

const processing = (s: AdminAsset['state']) => s === 'UPLOADING' || s === 'PENDING' || s === 'RUNNING';
const active = (u: UploadItem) => u.state === 'uploading' || u.state === 'saving';
const pct = (u: UploadItem) => (u.size ? Math.round((u.loaded / u.size) * 100) : 0);

/** Plain-language warning about a processed file, or null */
export function mediaWarning(a: Pick<AdminAsset, 'state' | 'width' | 'height'>, role: Role): string | null {
  if (a.state !== 'READY' || !a.width || !a.height) return null;
  if (role === 'PANORAMA') return Math.abs(a.width / a.height - 2) > 0.05 ? 'Не 2:1 — похоже, это не сферическая панорама' : null;
  if (KIND[role] === 'VIDEO') {
    if (a.height > a.width) return 'Вертикальное видео — в плеере по бокам будут чёрные поля';
    return Math.min(a.width, a.height) < 1080 ? `Разрешение ${a.width}×${a.height} ниже Full HD — на большом экране будет нечётким` : null;
  }
  return Math.min(a.width, a.height) < SMALL_PX ? `Маленькое фото ${a.width}×${a.height} — на большом экране будет нечётким` : null;
}

/**
 * Photos and videos of one location for people who are not developers: upload by drag-and-drop, replace, pick the cover,
 * reorder, set the time of day or the showreel label. Every action is saved at once; removed and replaced files stay in the media library.
 */
export function PhotoManager({ id }: { id: string }) {
  const toast = useToast();
  const { items: uploads, add, dismiss } = useUploads();
  const { data, mutate } = useApi<Loc>(`/admin/locations/${id}`, {
    // Fresh uploads are processed by the worker in the background: poll until every file is ready
    refreshInterval: (d) => (d && (d.media.some((m) => processing(m.asset.state)) || (d.cover && processing(d.cover.state))) ? 2500 : 0),
  });
  const [dialog, setDialog] = useState<string | null>(null);
  const [library, setLibrary] = useState<Role | null>(null);
  const [watermark, setWatermark] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<Target>({ role: 'PHOTO', multiple: true });

  if (!data) return <Loading />;

  const save = async (request: Promise<Loc>, ok?: string) => {
    try {
      await mutate(await request, { revalidate: false });
      if (ok) toast('ok', ok);
    } catch (e) {
      toast('error', errorText(e));
      void mutate();
    }
  };

  const pick = (t: Target) => {
    target.current = t;
    if (!input.current) return;
    input.current.multiple = t.multiple;
    input.current.accept = extFor(t.role).accept;
    input.current.click();
  };

  const start = (all: File[], t: Target) => {
    const ext = extFor(t.role);
    const bad = all.filter((f) => !ext.re.test(f.name));
    if (bad.length) toast('error', `${ext.refuse}: ${bad.map((f) => f.name).join(', ')}. Подходят ${ext.formats}.`);
    const files = all.filter((f) => ext.re.test(f.name)).slice(0, t.multiple ? undefined : 1);
    if (!files.length) return;
    const video = KIND[t.role] === 'VIDEO';
    const tag = t.replace && !t.cover ? `${id}:replace:${t.replace}` : t.cover ? `${id}:cover` : `${id}:${t.role}`;
    const results = add(files, { panorama: t.role === 'PANORAMA', watermark: video && watermark, tag }, async (asset, i) => {
      // Files are attached in the order they were picked, whichever finishes uploading first
      await Promise.allSettled(results.slice(0, i));
      const saved = await api.post<Loc>(`/admin/locations/${id}/media`, { assetId: asset.id, role: t.role, replaceAssetId: t.replace, cover: t.cover || undefined });
      await mutate(saved, { revalidate: false });
    });
    void Promise.all(results).then((done) => {
      const n = done.filter(Boolean).length;
      if (!n) return;
      const what = t.cover ? 'Обложка обновлена' : t.replace ? (video ? 'Видео заменено' : 'Фото заменено') : n === 1 ? (video ? 'Видео добавлено' : 'Фото добавлено') : `Добавлено файлов: ${n}`;
      toast('ok', video ? `${what} — обработка займёт несколько минут` : what);
    });
  };

  const attachFromLibrary = async (role: Role, assets: AdminAsset[]) => {
    for (const a of assets) await save(api.post<Loc>(`/admin/locations/${id}/media`, { assetId: a.id, role }));
    if (assets.length) toast('ok', assets.length === 1 ? 'Файл добавлен' : `Добавлено файлов: ${assets.length}`);
  };

  const patch = (m: MediaItem, body: Record<string, unknown>, ok?: string) => void save(api.patch<Loc>(`/admin/locations/${id}/media/${m.assetId}`, body), ok);

  const remove = (m: MediaItem, isCover: boolean) => {
    const what = KIND[m.role] === 'VIDEO' ? 'это видео' : 'это фото';
    const notes = [
      isCover && 'Обложкой станет следующее фото галереи.',
      m.onHome?.length && `Ролик останется на главной (${m.onHome.join(', ')}) — поменять его можно в разделе «Главная».`,
      'Файл останется в «Медиатеке» — его можно вернуть.',
    ].filter(Boolean);
    if (!confirm(`Убрать ${what} с локации?\n${notes.join('\n')}`)) return;
    void save(api.del<Loc>(`/admin/locations/${id}/media/${m.assetId}`), KIND[m.role] === 'VIDEO' ? 'Видео убрано' : 'Фото убрано');
  };

  /** Moves an item inside its list; the order goes out at once and shows before the server answers */
  const reorder = (list: MediaItem[], from: number, to: number) => {
    if (to < 0 || to >= list.length || from === to) return;
    const next = [...list];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    const ids = new Set(next.map((m) => m.assetId));
    const queue = [...next];
    const media = data.media.map((m) => (ids.has(m.assetId) ? queue.shift()! : m));
    mutate(api.put<Loc>(`/admin/locations/${id}/media/order`, { assetIds: next.map((m) => m.assetId) }), {
      optimisticData: { ...data, media },
      rollbackOnError: true,
      revalidate: false,
    }).catch((e) => toast('error', errorText(e)));
  };

  const byRole = (role: Role) => data.media.filter((m) => m.role === role);
  const photos = byRole('PHOTO');
  const coverItem = photos.find((m) => m.assetId === data.coverAssetId);
  const cover = coverItem?.asset ?? data.cover;
  const mine = uploads.filter((u) => u.tag?.startsWith(`${id}:`));
  const coverUpload = mine.find((u) => u.tag === `${id}:cover` && active(u));
  const failed = mine.filter((u) => u.state === 'error');
  const coverWarning = cover && mediaWarning(cover, 'PHOTO');

  const section = (role: Role, list: MediaItem[]) => (
    <Section
      role={role}
      list={list}
      uploads={mine.filter((u) => active(u) && u.tag === `${id}:${role}`)}
      replacing={(assetId) => mine.find((u) => active(u) && u.tag === `${id}:replace:${assetId}`)}
      extra={KIND[role] === 'VIDEO' ? <Toggle checked={watermark} onChange={setWatermark} label="Водяной знак LOCI360 на новых видео" /> : null}
      onFiles={(files) => start(files, { role, multiple: true })}
      onAdd={() => pick({ role, multiple: true })}
      onLibrary={() => setLibrary(role)}
      onCover={(m) => patch(m, { cover: true }, 'Обложка выбрана')}
      onReplace={(m) => pick({ role, multiple: false, replace: m.assetId })}
      onEdit={(m) => setDialog(m.assetId)}
      onRemove={(m) => remove(m, false)}
      onPatch={patch}
      onMove={(from, to) => reorder(list, from, to)}
    />
  );

  return (
    <div>
      <Link href="/admin/photos" className="mb-4 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-white">
        <ArrowLeft className="size-4" /> Все локации
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="display truncate text-3xl text-white">{data.nameEn}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <span>{data.nameRu}</span>
            {data.status !== 'PUBLISHED' && <Badge tone={PUBLISH_STATUS[data.status].tone}>{PUBLISH_STATUS[data.status].label}</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.status === 'PUBLISHED' && (
            <a href={`/locations/${data.slug}`} target="_blank" className="btn-ghost btn-sm">
              <ExternalLink className="size-4" /> Открыть на сайте
            </a>
          )}
          <Link href={`/admin/locations/${id}`} className="btn-ghost btn-sm">
            Тексты и паспорт
          </Link>
        </div>
      </div>

      <p className="mb-6 max-w-3xl rounded-xl border border-border bg-white/[0.03] px-4 py-3 text-sm leading-relaxed text-fg-muted">
        Всё сохраняется сразу, кнопку «Сохранить» нажимать не нужно. Новое фото появится на сайте после обработки — обычно 5–20 секунд, видео — несколько минут.
        Убранные и заменённые файлы остаются в «Медиатеке», их можно вернуть кнопкой «Из медиатеки».
      </p>

      {failed.length > 0 && (
        <div className="mb-6 space-y-2">
          {failed.map((u) => (
            <div key={u.key} className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-white">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
              <span className="min-w-0 flex-1">
                Не получилось: <b className="break-all">{u.name}</b> — {u.error}
              </span>
              <button type="button" onClick={() => dismiss(u.key)} className="flex size-6 items-center justify-center rounded-full hover:bg-white/10" aria-label="Скрыть">
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <section className="card mb-10 p-5 sm:p-6" aria-label="Обложка">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="relative overflow-hidden rounded-xl">
            {cover ? (
              <button type="button" onClick={() => setDialog(cover.id)} className="block w-full" aria-label="Подпись и автор обложки">
                <AssetThumb asset={cover} className="aspect-video" />
              </button>
            ) : (
              <div className="topo flex aspect-video flex-col items-center justify-center gap-2 text-fg-muted">
                <ImageOff className="size-8" />
                Обложки нет
              </div>
            )}
            {cover && processing(cover.state) && <StateBadge asset={cover} />}
            {coverUpload && <UploadOverlay u={coverUpload} />}
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="font-display text-xl font-semibold text-white">Обложка</h2>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                Главное фото локации: карточка в каталоге, всплывающее окно на карте и шапка страницы. Лучше горизонтальное, от 2000 px по короткой стороне.
              </p>
            </div>
            {coverWarning && <Warning text={coverWarning} />}
            {cover?.state === 'FAILED' && <Warning text={`Файл не обработан: ${cover.error ?? 'ошибка'}. Загрузите другой.`} />}
            {cover && <p className="text-xs text-fg-subtle">{cover.credit ? `Автор: ${cover.credit}` : 'Автор не указан'}</p>}
            <div className="flex flex-col items-start gap-2">
              <Button variant="primary" onClick={() => pick({ role: 'PHOTO', multiple: false, cover: true, replace: data.coverAssetId ?? undefined })} disabled={!!coverUpload}>
                <CloudUpload className="size-4" /> {cover ? 'Заменить обложку' : 'Загрузить обложку'}
              </Button>
              <div className="flex flex-wrap gap-2">
                {cover && (
                  <Button size="sm" onClick={() => setDialog(cover.id)}>
                    <PenLine className="size-4" /> Подпись и автор
                  </Button>
                )}
                {coverItem && (
                  <Button size="sm" onClick={() => remove(coverItem, true)}>
                    <Trash2 className="size-4" /> Убрать
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs leading-relaxed text-fg-subtle">Или нажмите «Обложкой» на любом фото галереи — прежняя обложка вернётся в галерею.</p>
          </div>
        </div>
      </section>

      {section('SHOWREEL', byRole('SHOWREEL'))}
      {section('BROLL', byRole('BROLL'))}
      {section('PHOTO', photos.filter((m) => m !== coverItem))}
      {section('PANORAMA', byRole('PANORAMA'))}

      <input
        ref={input}
        type="file"
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) start(files, target.current);
        }}
      />
      <AssetDialog
        id={dialog}
        onClose={() => {
          setDialog(null);
          void mutate();
        }}
      />
      <AssetPicker
        open={!!library}
        onClose={() => setLibrary(null)}
        kind={KIND[library ?? 'PHOTO']}
        multiple
        onPick={(assets) => library && void attachFromLibrary(library, assets.filter((a) => !data.media.some((m) => m.assetId === a.id)))}
        title={library ? `${SECTION[library].title}: из медиатеки` : ''}
      />
    </div>
  );
}

const SECTION: Record<Role, { title: string; text: string; add: string; drop: string; aspect: string }> = {
  SHOWREEL: {
    title: 'Шоурил',
    text: 'Главный ролик локации: плеер на странице и превью на карточке в каталоге. Первый — основной. Несколько роликов — это варианты окраса или настроения одной сцены: подпишите их («Teal & orange», «Ночь»), посетитель переключает их в плеере.',
    add: 'Добавить видео',
    drop: 'Перетащите видео сюда',
    aspect: 'aspect-video',
  },
  BROLL: {
    title: 'Доп. ролики (B-roll)',
    text: 'Короткие ролики под плеером: подъезд, детали, дрон. Подпишите, что в кадре.',
    add: 'Добавить видео',
    drop: 'Перетащите видео сюда',
    aspect: 'aspect-video',
  },
  PHOTO: {
    title: 'Галерея',
    text: 'Фото на странице локации в этом порядке. Чтобы поменять порядок, перетащите фото или нажмите стрелки. Время суток — для фильтра «день / золотой час / ночь».',
    add: 'Добавить фото',
    drop: 'Перетащите фото сюда',
    aspect: 'aspect-[3/2]',
  },
  PANORAMA: {
    title: 'Панорамы 360°',
    text: 'Только сферические снимки 2:1 (Insta360, Ricoh Theta, дрон в режиме сферы). Обычные фото сюда не загружайте. Подпись видна в просмотрщике.',
    add: 'Добавить панораму',
    drop: 'Перетащите панораму сюда',
    aspect: 'aspect-[2/1]',
  },
};

function Section({
  role,
  list,
  uploads,
  replacing,
  extra,
  onFiles,
  onAdd,
  onLibrary,
  onCover,
  onReplace,
  onEdit,
  onRemove,
  onPatch,
  onMove,
}: {
  role: Role;
  list: MediaItem[];
  uploads: UploadItem[];
  replacing: (assetId: string) => UploadItem | undefined;
  extra?: React.ReactNode;
  onFiles: (files: File[]) => void;
  onAdd: () => void;
  onLibrary: () => void;
  onCover: (m: MediaItem) => void;
  onReplace: (m: MediaItem) => void;
  onEdit: (m: MediaItem) => void;
  onRemove: (m: MediaItem) => void;
  onPatch: (m: MediaItem, body: Record<string, unknown>) => void;
  onMove: (from: number, to: number) => void;
}) {
  const s = SECTION[role];
  const [fileOver, setFileOver] = useState(false);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files');

  return (
    <section
      className={clsx('relative mb-12 rounded-2xl transition-shadow', fileOver && 'ring-2 ring-accent-bright ring-offset-4 ring-offset-bg')}
      aria-label={s.title}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setFileOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setFileOver(false);
        onFiles([...e.dataTransfer.files]);
      }}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="font-display text-xl font-semibold text-white">
            {s.title} <span className="text-fg-subtle">· {list.length}</span>
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-fg-muted">{s.text}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {extra}
          <Button size="sm" onClick={onLibrary}>
            <Images className="size-4" /> Из медиатеки
          </Button>
          <Button variant="primary" size="sm" onClick={onAdd}>
            {KIND[role] === 'VIDEO' ? <Film className="size-4" /> : <ImagePlus className="size-4" />} {s.add}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {list.map((m, i) => (
          <Tile
            key={m.assetId}
            m={m}
            aspect={s.aspect}
            index={i}
            count={list.length}
            upload={replacing(m.assetId)}
            dropTarget={!!drag && drag.over === i && drag.from !== i}
            dragging={drag?.from === i}
            onCover={() => onCover(m)}
            onReplace={() => onReplace(m)}
            onEdit={() => onEdit(m)}
            onRemove={() => onRemove(m)}
            onPatch={(body) => onPatch(m, body)}
            onMove={(d) => onMove(i, i + d)}
            handleProps={{
              draggable: true,
              onDragStart: (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', m.assetId);
                setDrag({ from: i, over: i });
              },
              onDragEnd: () => setDrag(null),
            }}
            dropProps={{
              onDragOver: (e) => {
                if (!drag) return;
                e.preventDefault();
                if (drag.over !== i) setDrag({ ...drag, over: i });
              },
              onDrop: (e) => {
                if (!drag) return;
                e.preventDefault();
                e.stopPropagation();
                onMove(drag.from, i);
                setDrag(null);
              },
            }}
          />
        ))}
        {uploads.map((u) => (
          <div key={u.key} className="card overflow-hidden">
            <div className={clsx('topo relative flex items-center justify-center', s.aspect)}>
              <Spinner className="size-6 text-white/60" />
              <UploadOverlay u={u} />
            </div>
            <p className="truncate p-3 text-xs text-fg-muted">{u.name}</p>
          </div>
        ))}
        <button
          type="button"
          onClick={onAdd}
          className={clsx(
            'flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors',
            fileOver ? 'border-accent-bright bg-accent-soft' : 'border-border-strong hover:border-white/40',
          )}
        >
          <CloudUpload className="size-7 text-accent-bright" />
          <span className="font-medium text-white">{s.drop}</span>
          <span className="text-xs text-fg-subtle">или нажмите, чтобы выбрать · можно несколько сразу</span>
        </button>
      </div>
    </section>
  );
}

function Tile({
  m,
  aspect,
  index,
  count,
  upload,
  dropTarget,
  dragging,
  onCover,
  onReplace,
  onEdit,
  onRemove,
  onPatch,
  onMove,
  handleProps,
  dropProps,
}: {
  m: MediaItem;
  aspect: string;
  index: number;
  count: number;
  upload?: UploadItem;
  dropTarget: boolean;
  dragging: boolean;
  onCover: () => void;
  onReplace: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onPatch: (body: Record<string, unknown>) => void;
  onMove: (d: number) => void;
  /** The picture is the drag handle, so the caption fields stay selectable */
  handleProps: React.HTMLAttributes<HTMLDivElement> & { draggable: boolean };
  dropProps: React.HTMLAttributes<HTMLDivElement>;
}) {
  const a = m.asset;
  const video = KIND[m.role] === 'VIDEO';
  const warning = mediaWarning(a, m.role);
  return (
    <div
      {...dropProps}
      className={clsx('card flex flex-col overflow-hidden transition', dropTarget && 'ring-2 ring-accent-bright', dragging && 'opacity-40')}
      data-testid="media-tile"
      data-role={m.role}
    >
      <div {...handleProps} className="relative cursor-grab active:cursor-grabbing" data-testid="media-handle">
        <button type="button" onClick={onEdit} className="block w-full [&_img]:pointer-events-none" aria-label={video ? 'Просмотр, подпись и автор' : 'Подпись и автор'}>
          <AssetThumb asset={a} className={aspect} />
        </button>
        {a.state !== 'READY' && <StateBadge asset={a} />}
        {video && a.state === 'READY' && a.durationSec ? (
          <span className="pointer-events-none absolute right-2 bottom-2 rounded bg-black/70 px-1.5 font-mono text-[11px] text-white">{fmtDuration(a.durationSec)}</span>
        ) : null}
        {upload && <UploadOverlay u={upload} />}
        <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[11px] text-white">
          {m.role === 'SHOWREEL' && index === 0 ? 'Основной' : index + 1}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-3">
        {m.role === 'PHOTO' && (
          <select value={m.timeOfDay ?? 'DAY'} onChange={(e) => onPatch({ timeOfDay: e.target.value })} className="input h-9 rounded-lg py-0 text-[13px]" aria-label="Время суток">
            {options(TIME_OF_DAY).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        {video && (
          <select value={m.role} onChange={(e) => onPatch({ role: e.target.value })} className="input h-9 rounded-lg py-0 text-[13px]" aria-label="Где показывать">
            <option value="SHOWREEL">Шоурил</option>
            <option value="BROLL">Доп. ролик (B-roll)</option>
          </select>
        )}
        {m.role !== 'PHOTO' && <Labels key={m.assetId} m={m} onSave={onPatch} />}
        <p className="truncate text-xs text-fg-subtle" title={a.credit ?? undefined}>
          {a.credit ? `Автор: ${a.credit}` : 'Автор не указан'}
        </p>
        {!!m.onHome?.length && (
          <p className="flex items-start gap-1.5 text-xs text-fg-muted">
            <House className="mt-0.5 size-3.5 shrink-0 text-accent-bright" />
            Также на главной: {m.onHome.map((h) => `«${h}»`).join(', ')}. При замене там тоже будет новый ролик.
          </p>
        )}
        {warning && <Warning text={warning} small />}
        {a.state === 'FAILED' && <Warning text={`Файл не обработан${a.error ? `: ${a.error}` : ''}. Замените его.`} small />}
        <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
          {m.role === 'PHOTO' && (
            <button type="button" onClick={onCover} disabled={a.state !== 'READY'} className="btn-ghost btn-sm h-8 px-2.5 text-xs disabled:opacity-40" title="Сделать обложкой">
              <Star className="size-3.5" /> Обложкой
            </button>
          )}
          <button type="button" onClick={onReplace} disabled={!!upload} className="btn-ghost btn-sm h-8 px-2.5 text-xs" title="Загрузить другой файл на это место">
            <Repeat2 className="size-3.5" /> Заменить
          </button>
          <div className="ml-auto flex items-center">
            <IconButton label={video ? 'Просмотр, подпись и автор' : 'Подпись и автор'} onClick={onEdit}>
              <PenLine className="size-4" />
            </IconButton>
            <IconButton label="Левее" onClick={() => onMove(-1)} disabled={index === 0}>
              <ArrowLeft className="size-4" />
            </IconButton>
            <IconButton label="Правее" onClick={() => onMove(1)} disabled={index === count - 1}>
              <ArrowRight className="size-4" />
            </IconButton>
            <IconButton label="Убрать с локации" onClick={onRemove} danger>
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Caption in both languages (a showreel's mood, a clip's subject, a panorama's view); saved when the field loses focus */
function Labels({ m, onSave }: { m: MediaItem; onSave: (body: Record<string, unknown>) => void }) {
  const [en, setEn] = useState(m.labelEn ?? '');
  const [ru, setRu] = useState(m.labelRu ?? '');
  const hint = m.role === 'SHOWREEL' ? 'Teal & orange' : m.role === 'BROLL' ? 'Drone over the canyon' : 'Above the canyon at sunset';
  const commit = (key: 'labelEn' | 'labelRu', value: string, was: string | null) => {
    if (value.trim() !== (was ?? '')) onSave({ [key]: value.trim() || null });
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <Input
        value={en}
        onChange={(e) => setEn(e.target.value)}
        onBlur={() => commit('labelEn', en, m.labelEn)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        placeholder={`EN: ${hint}`}
        maxLength={80}
        aria-label="Подпись на английском"
        className="h-9 rounded-lg text-[13px]"
      />
      <Input
        value={ru}
        onChange={(e) => setRu(e.target.value)}
        onBlur={() => commit('labelRu', ru, m.labelRu)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        placeholder="RU: подпись"
        maxLength={80}
        aria-label="Подпись на русском"
        className="h-9 rounded-lg text-[13px]"
      />
    </div>
  );
}

function IconButton({ label, danger, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      title={label}
      aria-label={label}
      className={clsx(
        'flex size-8 items-center justify-center rounded-full text-fg-muted disabled:opacity-30',
        danger ? 'hover:bg-danger-soft hover:text-danger' : 'hover:bg-white/10 hover:text-white',
      )}
    >
      {children}
    </button>
  );
}

function StateBadge({ asset }: { asset: AdminAsset }) {
  return (
    <span className="pointer-events-none absolute right-2 bottom-2">
      <Badge tone={ASSET_STATE[asset.state].tone}>
        {ASSET_STATE[asset.state].label}
        {asset.state === 'RUNNING' ? ` · ${asset.progress}%` : ''}
      </Badge>
    </span>
  );
}

function UploadOverlay({ u }: { u: UploadItem }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 px-4 text-center text-sm text-white">
      <span>{u.state === 'saving' ? 'Сохраняю…' : `Загрузка ${pct(u)}%`}</span>
      <div className="h-1 w-3/4 overflow-hidden rounded-full bg-white/15">
        <div className="h-full rounded-full bg-accent-bright transition-[width]" style={{ width: `${u.state === 'saving' ? 100 : pct(u)}%` }} />
      </div>
    </div>
  );
}

function Warning({ text, small }: { text: string; small?: boolean }) {
  return (
    <p className={clsx('flex items-start gap-1.5 text-warning', small ? 'text-xs' : 'text-sm')}>
      <TriangleAlert className={clsx('mt-0.5 shrink-0', small ? 'size-3.5' : 'size-4')} />
      {text}
    </p>
  );
}
