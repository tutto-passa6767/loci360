import { Injectable } from '@nestjs/common';
import type { Asset, DerivedImage, DerivedMedia } from '@loci/db';
import { Lang, trOpt } from './lang';
import { S3Service } from './s3.service';

export interface PublicImage {
  /** default size (about 1600 px wide) */
  src: string;
  srcSet: string;
  width: number;
  height: number;
  blur: string | null;
  color: string | null;
  alt: string;
  credit: string | null;
}

export interface PublicVideo {
  id: string;
  hls: string;
  poster: PublicImage;
  loop: string | null;
  preview: string | null;
  sprite: { url: string; interval: number; cols: number; rows: number; tileW: number; tileH: number; count: number } | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  /** short side of every rendition, best first: [2160, 1080, 720] */
  qualities: number[];
  credit: string | null;
}

export interface PublicPanorama {
  id: string;
  /** equirectangular images, ascending by width — the viewer picks what the GPU can hold */
  sources: { url: string; width: number; height: number }[];
  preview: PublicImage;
  credit: string | null;
}

type MediaAsset = Pick<Asset, 'id' | 'kind' | 'state' | 'derived' | 'altEn' | 'altRu' | 'credit' | 'durationSec' | 'width' | 'height' | 'title'>;

/** Columns a public query has to select for the presenter */
export const ASSET_PUBLIC_SELECT = {
  id: true,
  kind: true,
  state: true,
  derived: true,
  altEn: true,
  altRu: true,
  credit: true,
  durationSec: true,
  width: true,
  height: true,
  title: true,
} as const;

const pickSize = (images: DerivedImage[], target: number) =>
  images.find((i) => i.w >= target) ?? images[images.length - 1];

/** Turns processed asset keys into public (CDN) URLs */
@Injectable()
export class MediaPresenter {
  constructor(private readonly s3: S3Service) {}

  url(key: string) {
    return this.s3.mediaUrl(key);
  }

  derived(asset: Pick<Asset, 'state' | 'derived'> | null | undefined): DerivedMedia | null {
    if (!asset || asset.state !== 'READY' || !asset.derived) return null;
    const d = asset.derived as unknown as DerivedMedia;
    return d.images?.length ? d : null;
  }

  image(asset: MediaAsset | null | undefined, lang: Lang, fallbackAlt = '', target = 1600): PublicImage | null {
    const d = this.derived(asset);
    if (!asset || !d) return null;
    const main = pickSize(d.images, target);
    const largest = d.images[d.images.length - 1];
    return {
      src: this.url(main.key),
      srcSet: d.images.map((i) => `${this.url(i.key)} ${i.w}w`).join(', '),
      width: largest.w,
      height: largest.h,
      blur: d.blur ?? null,
      color: d.color ?? null,
      alt: trOpt(asset, 'alt', lang) ?? fallbackAlt,
      credit: asset.credit ?? null,
    };
  }

  /** Smallest size at least `target` px wide — for thumbnails in popups and lists */
  thumb(asset: MediaAsset | null | undefined, target = 480): string | null {
    const d = this.derived(asset);
    return d ? this.url(pickSize(d.images, target).key) : null;
  }

  video(asset: MediaAsset | null | undefined, lang: Lang, fallbackAlt = ''): PublicVideo | null {
    const d = this.derived(asset);
    if (!asset || !d?.video) return null;
    const v = d.video;
    return {
      id: asset.id,
      hls: this.url(v.hls),
      poster: this.image(asset, lang, fallbackAlt, 1920)!,
      loop: v.loop ? this.url(v.loop) : null,
      preview: v.preview ? this.url(v.preview) : null,
      sprite: v.sprite ? { ...v.sprite, url: this.url(v.sprite.key) } : null,
      durationSec: asset.durationSec ?? null,
      width: asset.width ?? null,
      height: asset.height ?? null,
      qualities: v.renditions.map((r) => Math.min(r.width, r.height)).sort((a, b) => b - a),
      credit: asset.credit ?? null,
    };
  }

  panorama(asset: MediaAsset | null | undefined, lang: Lang, fallbackAlt = ''): PublicPanorama | null {
    const d = this.derived(asset);
    if (!asset || !d?.panorama?.length) return null;
    return {
      id: asset.id,
      sources: d.panorama.map((p) => ({ url: this.url(p.key), width: p.w, height: p.h })),
      preview: this.image(asset, lang, fallbackAlt)!,
      credit: asset.credit ?? null,
    };
  }

  /** Open Graph image: dedicated 1200×630 crop, otherwise the largest WebP */
  og(asset: MediaAsset | null | undefined): { url: string; width: number; height: number } | null {
    const d = this.derived(asset);
    if (!d) return null;
    const img = d.og ?? pickSize(d.images, 1200);
    return { url: this.url(img.key), width: img.w, height: img.h };
  }
}
