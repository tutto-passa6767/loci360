'use client';

import clsx from 'clsx';
import { CheckCircle2, CloudUpload, TriangleAlert, X } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { api, fmtSize, type AdminAsset } from '@/lib/admin';
import { useLatest } from '@/lib/hooks';
import { errorText, Toggle } from './ui';

interface StartRes {
  assetId: string;
  partSize: number;
  partsCount: number;
}
interface StatusRes extends StartRes {
  uploaded: number[];
}

export interface UploadItem {
  key: string;
  name: string;
  size: number;
  loaded: number;
  /** saving — the file is in storage and the page is attaching it (e.g. to a location) */
  state: 'uploading' | 'saving' | 'done' | 'error' | 'cancelled';
  error?: string;
  assetId?: string;
  /** Who started the upload, so a page can show its own uploads in place (e.g. "photos of location X") */
  tag?: string;
  cancel: () => void;
}

export interface UploadOptions {
  panorama: boolean;
  watermark: boolean;
  tag?: string;
}

/** Runs after a file reached storage; the upload counts as finished only when it settles */
export type AfterUpload = (asset: AdminAsset, index: number) => Promise<unknown> | void;

const PARALLEL = 4;
const RESUME_KEY = 'loci.uploads';

/** Interrupted uploads are remembered by name + size + mtime, so choosing the same file again resumes it */
const fingerprint = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
const readResume = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(RESUME_KEY) ?? '{}');
  } catch {
    return {};
  }
};
const writeResume = (fp: string, assetId: string | null) => {
  try {
    const all = readResume();
    if (assetId) all[fp] = assetId;
    else delete all[fp];
    localStorage.setItem(RESUME_KEY, JSON.stringify(all));
  } catch {
    // storage may be unavailable (private mode) — uploads still work, just without resume
  }
};

function putPart(url: string, blob: Blob, signal: AbortSignal, onProgress: (n: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Хранилище ответило ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('Сеть недоступна'));
    xhr.onabort = () => reject(new DOMException('aborted', 'AbortError'));
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(blob);
  });
}

/**
 * Multipart upload straight to storage: the API signs part URLs, the browser sends 4 parts at a time,
 * failed parts are retried, and a reload resumes from the parts the storage already has.
 */
async function upload(file: File, opts: { kind?: 'PANORAMA'; watermark: boolean }, signal: AbortSignal, onProgress: (loaded: number) => void): Promise<AdminAsset> {
  const fp = fingerprint(file);
  let session: StatusRes | null = null;
  const resumeId = readResume()[fp];
  if (resumeId) session = await api.get<StatusRes>(`/admin/uploads/${resumeId}`).catch(() => null);
  if (!session) {
    const start = await api.post<StartRes>('/admin/uploads', { fileName: file.name, size: file.size, mimeType: file.type || undefined, kind: opts.kind, watermark: opts.watermark });
    session = { ...start, uploaded: [] };
    writeResume(fp, start.assetId);
  }
  const { assetId, partSize, partsCount } = session;
  const sizeOf = (n: number) => (n === partsCount ? file.size - partSize * (partsCount - 1) : partSize);
  const done = new Set(session.uploaded);
  const partLoaded = new Map<number, number>();
  const report = () => onProgress([...done].reduce((a, n) => a + sizeOf(n), 0) + [...partLoaded.values()].reduce((a, b) => a + b, 0));
  report();

  const queue = Array.from({ length: partsCount }, (_, i) => i + 1).filter((n) => !done.has(n));
  const urls = new Map<number, string>();
  const sign = async (numbers: number[]) => {
    const res = await api.post<{ urls: Record<string, string> }>(`/admin/uploads/${assetId}/parts`, { partNumbers: numbers });
    for (const [n, u] of Object.entries(res.urls)) urls.set(Number(n), u);
  };

  const worker = async () => {
    while (queue.length) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      const n = queue.shift()!;
      for (let attempt = 1; ; attempt++) {
        try {
          if (!urls.has(n)) await sign([n, ...queue.slice(0, 19)]);
          const blob = file.slice((n - 1) * partSize, (n - 1) * partSize + sizeOf(n));
          await putPart(urls.get(n)!, blob, signal, (b) => {
            partLoaded.set(n, b);
            report();
          });
          partLoaded.delete(n);
          done.add(n);
          report();
          break;
        } catch (e) {
          partLoaded.delete(n);
          if ((e as Error).name === 'AbortError' || attempt >= 4) throw e;
          urls.delete(n);
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length || 1) }, worker));
  const asset = await api.post<AdminAsset>(`/admin/uploads/${assetId}/complete`);
  writeResume(fp, null);
  return asset;
}

const UploadsCtx = createContext<{
  items: UploadItem[];
  /** Returns one promise per file: the uploaded asset, or null if the upload or `after` failed */
  add: (files: File[], opts: UploadOptions, after?: AfterUpload) => Promise<AdminAsset | null>[];
  clear: () => void;
  dismiss: (key: string) => void;
} | null>(null);

/** Keeps uploads running while the editor moves between CMS pages */
export function UploadsProvider({ children, onUploaded }: { children: React.ReactNode; onUploaded?: (a: AdminAsset) => void }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const cb = useLatest(onUploaded);
  const update = (key: string, patch: Partial<UploadItem>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const add = useCallback((files: File[], opts: UploadOptions, after?: AfterUpload) => {
    return files.map((file, index) => {
      const key = `${fingerprint(file)}|${Date.now()}|${index}`;
      const ctrl = new AbortController();
      setItems((l) => [...l, { key, name: file.name, size: file.size, loaded: 0, state: 'uploading', tag: opts.tag, cancel: () => ctrl.abort() }]);
      return upload(file, { kind: opts.panorama ? 'PANORAMA' : undefined, watermark: opts.watermark }, ctrl.signal, (loaded) => update(key, { loaded }))
        .then(async (asset) => {
          update(key, { state: 'saving', loaded: file.size, assetId: asset.id });
          cb.current?.(asset);
          await after?.(asset, index);
          update(key, { state: 'done' });
          return asset;
        })
        .catch((e) => {
          update(key, (e as Error).name === 'AbortError' ? { state: 'cancelled' } : { state: 'error', error: errorText(e) });
          return null;
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cb is a stable ref
  }, []);
  const clear = useCallback(() => setItems((l) => l.filter((i) => i.state === 'uploading' || i.state === 'saving')), []);
  const dismiss = useCallback((key: string) => setItems((l) => l.filter((i) => i.key !== key)), []);
  return <UploadsCtx.Provider value={{ items, add, clear, dismiss }}>{children}</UploadsCtx.Provider>;
}

export const useUploads = () => useContext(UploadsCtx)!;

/** Drop zone + list of running uploads */
export function Uploader({ compact = false, defaultPanorama = false }: { compact?: boolean; defaultPanorama?: boolean }) {
  const { items, add, clear } = useUploads();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [panorama, setPanorama] = useState(defaultPanorama);
  const [watermark, setWatermark] = useState(true);

  const pick = (list: FileList | null) => {
    if (list?.length) add([...list], { panorama, watermark });
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files);
        }}
        className={clsx(
          'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed text-center transition-colors',
          compact ? 'px-4 py-6' : 'px-6 py-10',
          drag ? 'border-accent-bright bg-accent-soft' : 'border-border-strong',
        )}
      >
        <CloudUpload className="size-8 text-accent-bright" />
        <div>
          <p className="font-medium text-white">Перетащите видео и фото сюда</p>
          <p className="mt-1 text-xs text-fg-subtle">MP4, MOV, MXF до 200 ГБ · JPEG, PNG, TIFF, HEIC. Файлы уходят прямо в хранилище, загрузку можно продолжить после обрыва.</p>
        </div>
        <button type="button" className="btn-primary btn-sm" onClick={() => input.current?.click()}>
          Выбрать файлы
        </button>
        <input ref={input} type="file" multiple hidden accept="video/*,image/*,.mxf,.mov,.heic,.heif,.tif,.tiff" onChange={(e) => (pick(e.target.files), (e.target.value = ''))} />
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 pt-1">
          <Toggle checked={panorama} onChange={setPanorama} label="Фото — это панорама 360° (2:1)" />
          <Toggle checked={watermark} onChange={setWatermark} label="Водяной знак LOCI360 на видео" />
        </div>
      </div>
      {items.length > 0 && (
        <div className="card divide-y divide-border">
          {items.map((i) => {
            const pct = i.size ? Math.round((i.loaded / i.size) * 100) : 0;
            return (
              <div key={i.key} className="flex items-center gap-3 px-4 py-3 text-sm">
                {i.state === 'done' ? (
                  <CheckCircle2 className="size-4 shrink-0 text-success" />
                ) : i.state === 'error' ? (
                  <TriangleAlert className="size-4 shrink-0 text-danger" />
                ) : (
                  <CloudUpload className="size-4 shrink-0 text-accent-bright" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-white">{i.name}</p>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                    <div className={clsx('h-full rounded-full transition-[width]', i.state === 'error' ? 'bg-danger' : 'bg-accent-bright')} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-fg-subtle">
                    {i.state === 'error'
                      ? i.error
                      : i.state === 'done'
                        ? 'Загружено — файл в очереди на обработку'
                        : i.state === 'saving'
                          ? 'Загружено, сохраняю…'
                        : i.state === 'cancelled'
                          ? 'Отменено'
                          : `${fmtSize(i.loaded)} из ${fmtSize(i.size)} · ${pct}%`}
                  </p>
                </div>
                {i.state === 'uploading' && (
                  <button type="button" onClick={i.cancel} className="flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-white/10" aria-label="Отменить">
                    <X className="size-4" />
                  </button>
                )}
              </div>
            );
          })}
          {items.some((i) => i.state !== 'uploading' && i.state !== 'saving') && (
            <button type="button" onClick={clear} className="w-full px-4 py-2 text-left text-xs text-fg-subtle hover:text-white">
              Очистить завершённые
            </button>
          )}
        </div>
      )}
    </div>
  );
}
