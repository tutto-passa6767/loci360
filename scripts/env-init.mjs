// Creates .env from .env.example with random secrets. Never overwrites an existing .env.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const target = resolve(root, '.env');
if (existsSync(target)) {
  console.log('.env already exists — left untouched');
  process.exit(0);
}

const secret = (n = 24) => randomBytes(n).toString('base64url');
const pg = secret(18);
const minio = secret(18);

const env = readFileSync(resolve(root, '.env.example'), 'utf8')
  .replace(/^APP_SECRET=.*$/m, `APP_SECRET=${secret(32)}`)
  .replace(/^REVALIDATE_SECRET=.*$/m, `REVALIDATE_SECRET=${secret(24)}`)
  .replace(/^POSTGRES_PASSWORD=.*$/m, `POSTGRES_PASSWORD=${pg}`)
  .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=postgresql://loci:${pg}@localhost:54360/loci360?schema=public`)
  .replace(/^MINIO_ROOT_PASSWORD=.*$/m, `MINIO_ROOT_PASSWORD=${minio}`)
  .replace(/^S3_SECRET_KEY=.*$/m, `S3_SECRET_KEY=${minio}`);

writeFileSync(target, env);
console.log('.env created');
