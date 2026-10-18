import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

// Locally settings come from the root .env; in containers — from the environment.
loadEnv({ path: resolve(__dirname, '../../../.env'), quiet: true });

const str = (key: string, fallback?: string): string => {
  const v = process.env[key];
  if (v !== undefined && v !== '') return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Environment variable ${key} is not set`);
};
const num = (key: string, fallback: number): number => {
  const v = process.env[key];
  return v ? Number(v) : fallback;
};
const bool = (key: string, fallback: boolean): boolean => {
  const v = process.env[key];
  return v ? v === 'true' || v === '1' : fallback;
};

const MiB = 1024 * 1024;

export const cfg = {
  port: num('API_PORT', 4360),
  appUrl: str('APP_URL', 'http://localhost:3360').replace(/\/$/, ''),
  cookieSecure: bool('COOKIE_SECURE', false),
  /** Proxies in front of the API (the web app's rewrite, a load balancer) — for the real client IP */
  trustProxy: num('TRUST_PROXY', 1),
  appSecret: str('APP_SECRET'),
  sessionTtlDays: num('SESSION_TTL_DAYS', 14),
  s3: {
    endpoint: str('S3_ENDPOINT'),
    publicEndpoint: str('S3_PUBLIC_ENDPOINT', process.env.S3_ENDPOINT),
    region: str('S3_REGION', 'us-east-1'),
    accessKey: str('S3_ACCESS_KEY'),
    secretKey: str('S3_SECRET_KEY'),
    originals: str('S3_BUCKET_ORIGINALS', 'loci-originals'),
    media: str('S3_BUCKET_MEDIA', 'loci-media'),
  },
  /** Base URL of the public media bucket or the CDN in front of it */
  mediaUrl: str('MEDIA_PUBLIC_URL').replace(/\/$/, ''),
  smtp: {
    host: str('SMTP_HOST', 'localhost'),
    port: num('SMTP_PORT', 51360),
    secure: bool('SMTP_SECURE', false),
    user: process.env.SMTP_USER || undefined,
    password: process.env.SMTP_PASSWORD || undefined,
    from: str('MAIL_FROM', 'LOCI360 <no-reply@loci360.kz>'),
  },
  upload: {
    partSize: num('UPLOAD_PART_SIZE_MB', 32) * MiB,
    maxBytes: num('UPLOAD_MAX_GB', 200) * 1024 * MiB,
  },
  signedUrlTtlSec: num('SIGNED_URL_TTL_SEC', 3600),
  web: {
    internalUrl: (process.env.WEB_INTERNAL_URL || '').replace(/\/$/, ''),
    revalidateSecret: process.env.REVALIDATE_SECRET || '',
  },
  isProduction: process.env.NODE_ENV === 'production',
};
