import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Asset, DerivedImage, DerivedMedia } from '@loci/db';
import { cfg } from '../config';
import { putMedia } from '../s3';
import { run, runOk } from '../tools';

/** One processing run of one asset. Output goes to a/{id}/{rev}/ in the media bucket. */
export interface Job {
  asset: Asset;
  rev: number;
  prefix: string;
  progress: (pct: number) => Promise<void>;
}

/** Responsive widths for photos and video posters */
export const IMAGE_WIDTHS = [480, 960, 1600, 2560];

/** Temporary directory of a job; removed afterwards whatever happens */
export async function withWorkDir<T>(assetId: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = join(cfg.workDir, `${assetId}-${randomUUID().slice(0, 8)}`);
  await mkdir(dir, { recursive: true });
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function fileExists(path: string) {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

/** Display size, with EXIF rotation applied (portrait phone photos are stored sideways) */
export async function imageSize(file: string): Promise<{ width: number; height: number }> {
  const w = Number((await runOk('vipsheader', ['-f', 'width', file], { timeoutMs: 60_000 })).stdout.trim());
  const h = Number((await runOk('vipsheader', ['-f', 'height', file], { timeoutMs: 60_000 })).stdout.trim());
  const o = await run('vipsheader', ['-f', 'orientation', file], { timeoutMs: 60_000 });
  const orientation = o.code === 0 ? Number(o.stdout.trim()) : 1;
  return orientation >= 5 && orientation <= 8 ? { width: h, height: w } : { width: w, height: h };
}

/** Shrinks (never enlarges) to `width`, optionally cropping to an exact box. Applies EXIF orientation. */
export async function thumbnail(
  src: string,
  out: string,
  width: number,
  opts: { height?: number; crop?: 'centre' | 'attention'; save?: string } = {},
) {
  const args = ['thumbnail', src, opts.save ? `${out}[${opts.save}]` : out, String(width), '--size', 'down'];
  if (opts.height) args.push('--height', String(opts.height));
  if (opts.crop) args.push('--crop', opts.crop);
  await runOk('vips', args, { timeoutMs: 10 * 60_000 });
  return imageSize(out);
}

async function averageColor(src: string, dir: string): Promise<string | undefined> {
  const px = join(dir, `px-${randomUUID().slice(0, 6)}.png`);
  const r = await run('vips', ['thumbnail', src, px, '1', '--height', '1', '--size', 'force'], { timeoutMs: 60_000 });
  if (r.code !== 0) return undefined;
  const p = await run('vips', ['getpoint', px, '0', '0'], { timeoutMs: 60_000 });
  const [red, green, blue] = p.stdout.trim().split(/\s+/).map(Number);
  if ([red, green, blue].some((v) => !Number.isFinite(v))) return undefined;
  const hex = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${hex(red)}${hex(green)}${hex(blue)}`;
}

/**
 * Everything the site needs from one still image: WebP sizes, a JPEG for PDF spec sheets,
 * a 1200×630 Open Graph crop, a blurred placeholder and the average colour.
 * `crop16x9` — for panoramas, whose 2:1 frame is cropped for cards and thumbnails.
 */
export async function deriveStill(
  job: Job,
  src: string,
  dir: string,
  opts: { crop16x9?: boolean; name?: string } = {},
): Promise<Pick<DerivedMedia, 'images' | 'jpeg' | 'og' | 'blur' | 'color'>> {
  const base = opts.name ?? 'img';
  const size = await imageSize(src);
  const widths = IMAGE_WIDTHS.filter((w) => w <= size.width);
  if (!widths.length || widths[widths.length - 1] < size.width) widths.push(Math.min(size.width, 2560));
  const uniq = [...new Set(widths)].sort((a, b) => a - b);

  const images: DerivedImage[] = [];
  for (const w of uniq) {
    const out = join(dir, `${base}_${w}.webp`);
    const h = opts.crop16x9 ? Math.round((w * 9) / 16) : undefined;
    const s = await thumbnail(src, out, w, { save: 'Q=82,strip', ...(h ? { height: h, crop: 'centre' as const } : {}) });
    const key = `${job.prefix}${base}_${w}.webp`;
    await putMedia(key, out, 'image/webp');
    images.push({ key, w: s.width, h: s.height });
  }

  const jpegPath = join(dir, `${base}_print.jpg`);
  const jw = Math.min(1600, size.width);
  const js = await thumbnail(src, jpegPath, jw, {
    save: 'Q=85,strip,optimize_coding',
    ...(opts.crop16x9 ? { height: Math.round((jw * 9) / 16), crop: 'centre' as const } : {}),
  });
  const jpegKey = `${job.prefix}${base}_print.jpg`;
  await putMedia(jpegKey, jpegPath, 'image/jpeg');

  const ogPath = join(dir, `${base}_og.jpg`);
  const os = await thumbnail(src, ogPath, 1200, { height: 630, crop: 'attention', save: 'Q=85,strip,optimize_coding' });
  const ogKey = `${job.prefix}${base}_og.jpg`;
  await putMedia(ogKey, ogPath, 'image/jpeg');

  const blurPath = join(dir, `${base}_blur.webp`);
  await thumbnail(src, blurPath, 24, { save: 'Q=40,strip' });
  const blur = `data:image/webp;base64,${(await readFile(blurPath)).toString('base64')}`;

  return {
    images,
    jpeg: { key: jpegKey, w: js.width, h: js.height },
    og: { key: ogKey, w: os.width, h: os.height },
    blur,
    color: await averageColor(src, dir),
  };
}
