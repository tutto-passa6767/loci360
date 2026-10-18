import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(__dirname, '../../../.env'), quiet: true });

const req = (key: string, fallback?: string) => {
  const v = process.env[key];
  if (v) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Environment variable ${key} is not set`);
};
const num = (key: string, fallback: number) => (process.env[key] ? Number(process.env[key]) : fallback);

export const cfg = {
  s3: {
    endpoint: req('S3_ENDPOINT'),
    region: req('S3_REGION', 'us-east-1'),
    accessKey: req('S3_ACCESS_KEY'),
    secretKey: req('S3_SECRET_KEY'),
    originals: req('S3_BUCKET_ORIGINALS', 'loci-originals'),
    media: req('S3_BUCKET_MEDIA', 'loci-media'),
  },
  workDir: req('WORK_DIR', '/tmp/loci-work'),
  concurrency: num('WORKER_CONCURRENCY', 1),
  pollMs: num('WORKER_POLL_MS', 3000),
  maxAttempts: num('WORKER_MAX_ATTEMPTS', 3),
  /** libx264 preset: veryfast for previews on a laptop, slow for the final masters on a server */
  x264Preset: req('X264_PRESET', 'veryfast'),
  hlsSegmentSec: num('HLS_SEGMENT_SEC', 4),
  spriteIntervalSec: num('SPRITE_INTERVAL_SEC', 4),
  /** Hard limit for one external tool run */
  toolTimeoutMs: num('TOOL_TIMEOUT_MIN', 360) * 60_000,
  /** Unfinished multipart uploads are aborted after this many days */
  uploadTtlDays: num('UPLOAD_TTL_DAYS', 7),
};
