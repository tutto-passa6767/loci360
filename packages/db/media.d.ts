// Shape of Asset.derived — written by apps/worker, read by apps/api.
// Every key is relative to the public media bucket and lives under a/{assetId}/{rev}/,
// so a CDN can cache it forever: reprocessing writes a new revision instead of overwriting.

export interface DerivedImage {
  key: string;
  w: number;
  h: number;
}

export interface DerivedSprite {
  key: string;
  /** seconds between frames */
  interval: number;
  cols: number;
  rows: number;
  tileW: number;
  tileH: number;
  count: number;
}

export interface DerivedRendition {
  name: string;
  width: number;
  height: number;
  bandwidth: number;
}

export interface DerivedVideo {
  /** HLS master playlist */
  hls: string;
  renditions: DerivedRendition[];
  /** muted 1080p loop for full-screen hero backgrounds */
  loop?: string;
  /** muted low-res clip for hover previews on cards */
  preview?: string;
  sprite?: DerivedSprite;
  watermarked: boolean;
}

export interface DerivedMedia {
  rev: number;
  /** tiny blurred WebP as a data URI — shown while the real image loads */
  blur?: string;
  /** average colour, #rrggbb */
  color?: string;
  /** responsive WebP sizes, ascending by width (for video — the poster frame) */
  images: DerivedImage[];
  /** JPEG for PDF spec sheets */
  jpeg?: DerivedImage;
  /** 1200×630 JPEG crop for Open Graph */
  og?: DerivedImage;
  video?: DerivedVideo;
  /** equirectangular JPEGs for the 360° viewer, ascending by width */
  panorama?: DerivedImage[];
}
