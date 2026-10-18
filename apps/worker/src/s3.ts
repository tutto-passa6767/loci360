import { createReadStream, createWriteStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import {
  AbortMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { cfg } from './config';

export const s3 = new S3Client({
  endpoint: cfg.s3.endpoint,
  region: cfg.s3.region,
  forcePathStyle: true,
  credentials: { accessKeyId: cfg.s3.accessKey, secretAccessKey: cfg.s3.secretKey },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

/** Processed files never change in place (new revision = new prefix), so the CDN may cache them forever */
const IMMUTABLE = 'public, max-age=31536000, immutable';

/** URL for FFmpeg/ffprobe: they read the master over HTTP with seeking instead of copying 50 GB to disk */
export function originalUrl(key: string, ttlSec = 12 * 3600) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: cfg.s3.originals, Key: key }), { expiresIn: ttlSec });
}

export async function downloadOriginal(key: string, path: string) {
  const res = await s3.send(new GetObjectCommand({ Bucket: cfg.s3.originals, Key: key }));
  await pipeline(res.Body as Readable, createWriteStream(path));
}

export async function putMedia(key: string, path: string, contentType: string) {
  const { size } = await stat(path);
  await s3.send(
    new PutObjectCommand({
      Bucket: cfg.s3.media,
      Key: key,
      Body: createReadStream(path),
      ContentLength: size,
      ContentType: contentType,
      CacheControl: IMMUTABLE,
    }),
  );
  return size;
}

const MIME: Record<string, string> = {
  m3u8: 'application/vnd.apple.mpegurl',
  m4s: 'video/iso.segment',
  mp4: 'video/mp4',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

/** Uploads a whole directory (HLS) under a prefix; returns the total size */
export async function putMediaDir(prefix: string, dir: string): Promise<number> {
  let total = 0;
  const files: { full: string; rel: string; ext: string }[] = [];
  const walk = async (d: string) => {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else files.push({ full, rel: relative(dir, full).split('\\').join('/'), ext: entry.name.split('.').pop() ?? '' });
    }
  };
  await walk(dir);
  // A few uploads in parallel — HLS has hundreds of small segments
  for (let i = 0; i < files.length; i += 8) {
    const sizes = await Promise.all(
      files.slice(i, i + 8).map((f) => putMedia(`${prefix}${f.rel}`, f.full, MIME[f.ext] ?? 'application/octet-stream')),
    );
    total += sizes.reduce((a, b) => a + b, 0);
  }
  return total;
}

/** Deletes everything under `prefix` except keys starting with `keep` */
export async function deleteMediaPrefix(prefix: string, keep?: string) {
  let token: string | undefined;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: cfg.s3.media, Prefix: prefix, ContinuationToken: token }));
    const keys = (res.Contents ?? []).map((o) => o.Key!).filter((k) => !keep || !k.startsWith(keep));
    if (keys.length) {
      await s3.send(new DeleteObjectsCommand({ Bucket: cfg.s3.media, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }));
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
}

export async function abortUpload(key: string, uploadId: string) {
  try {
    await s3.send(new AbortMultipartUploadCommand({ Bucket: cfg.s3.originals, Key: key, UploadId: uploadId }));
  } catch (e: any) {
    if (e?.name !== 'NoSuchUpload') throw e;
  }
}
