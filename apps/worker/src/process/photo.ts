import { join } from 'node:path';
import type { DerivedImage, DerivedMedia, Prisma } from '@loci/db';
import { downloadOriginal, putMedia } from '../s3';
import { deriveStill, imageSize, Job, thumbnail, withWorkDir } from './common';

/** Photo: responsive WebP sizes, print JPEG, OG crop, placeholder */
export async function processPhoto(job: Job): Promise<{ derived: DerivedMedia; patch: Prisma.AssetUpdateInput }> {
  return withWorkDir(job.asset.id, async (dir) => {
    const src = join(dir, `original${extension(job.asset.originalName)}`);
    await downloadOriginal(job.asset.originalKey, src);
    await job.progress(30);
    const size = await imageSize(src);
    const still = await deriveStill(job, src, dir);
    return { derived: { rev: job.rev, ...still }, patch: { width: size.width, height: size.height } };
  });
}

/**
 * 360° panorama (equirectangular, 2:1): JPEG textures for the viewer — 4096 px for phones
 * (their GPUs cap textures at 4096) and 8192 px for desktops — plus 16:9 crops for cards.
 */
export async function processPanorama(job: Job): Promise<{ derived: DerivedMedia; patch: Prisma.AssetUpdateInput }> {
  return withWorkDir(job.asset.id, async (dir) => {
    const src = join(dir, `original${extension(job.asset.originalName)}`);
    await downloadOriginal(job.asset.originalKey, src);
    await job.progress(20);
    const size = await imageSize(src);
    const ratio = size.width / size.height;
    if (ratio < 1.9 || ratio > 2.1) {
      throw new Error(`NOT_EQUIRECTANGULAR: a 360° panorama must be 2:1, this image is ${size.width}×${size.height}`);
    }

    const panorama: DerivedImage[] = [];
    for (const w of [4096, 8192].filter((w, i) => i === 0 || size.width >= w)) {
      const width = Math.min(w, size.width);
      const out = join(dir, `pano_${w}.jpg`);
      const s = await thumbnail(src, out, width, { height: Math.round(width / 2), crop: 'centre', save: 'Q=85,strip,optimize_coding' });
      const key = `${job.prefix}pano_${w}.jpg`;
      await putMedia(key, out, 'image/jpeg');
      panorama.push({ key, w: s.width, h: s.height });
      await job.progress(panorama.length * 30);
    }
    const still = await deriveStill(job, src, dir, { crop16x9: true });
    return { derived: { rev: job.rev, ...still, panorama }, patch: { width: size.width, height: size.height } };
  });
}

function extension(name: string) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i).toLowerCase().replace(/[^.a-z0-9]/g, '') : '';
}
