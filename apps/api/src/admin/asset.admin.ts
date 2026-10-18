import type { Asset } from '@loci/db';
import { MediaPresenter } from '../common/media.presenter';

/** Columns the media library shows */
export const ASSET_ADMIN_SELECT = {
  id: true,
  kind: true,
  title: true,
  originalName: true,
  size: true,
  mime: true,
  state: true,
  progress: true,
  error: true,
  width: true,
  height: true,
  durationSec: true,
  credit: true,
  altEn: true,
  altRu: true,
  watermark: true,
  derived: true,
  createdAt: true,
  processedAt: true,
} as const;

type AdminAssetRow = Pick<Asset, keyof typeof ASSET_ADMIN_SELECT>;

export function presentAsset(media: MediaPresenter, a: AdminAssetRow, usage?: number) {
  const video = media.video({ ...a, altEn: a.altEn, altRu: a.altRu }, 'en');
  return {
    id: a.id,
    kind: a.kind,
    title: a.title,
    originalName: a.originalName,
    size: Number(a.size),
    mime: a.mime,
    state: a.state,
    progress: a.progress,
    error: a.error,
    width: a.width,
    height: a.height,
    durationSec: a.durationSec,
    credit: a.credit,
    altEn: a.altEn,
    altRu: a.altRu,
    watermark: a.watermark,
    createdAt: a.createdAt,
    processedAt: a.processedAt,
    thumb: media.thumb(a, 480),
    blur: media.derived(a)?.blur ?? null,
    preview: video?.preview ?? null,
    hls: video?.hls ?? null,
    panorama: media.panorama(a, 'en')?.sources ?? null,
    ...(usage !== undefined ? { usage } : {}),
  };
}

export type AdminAsset = ReturnType<typeof presentAsset>;
