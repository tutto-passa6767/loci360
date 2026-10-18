import { mkdir } from 'node:fs/promises';
import { type Asset, Prisma, PrismaClient } from '@loci/db';
import { cfg } from './config';
import { Job } from './process/common';
import { processPanorama, processPhoto } from './process/photo';
import { processVideo } from './process/video';
import { abortUpload, deleteMediaPrefix } from './s3';

const prisma = new PrismaClient();
const log = (scope: string, msg: string) => console.log(`${new Date().toISOString()} [${scope}] ${msg}`);

/** A RUNNING job whose heartbeat is older than this is considered abandoned (worker crashed or was restarted) */
const STALE_SEC = 180;
/** Errors that retries cannot fix */
const PERMANENT = /^(NO_VIDEO_STREAM|NOT_EQUIRECTANGULAR)/;

let stopping = false;
let running = 0;

/**
 * The job queue is the Asset table itself: PENDING rows are claimed with FOR UPDATE SKIP LOCKED,
 * so several workers can run side by side without Redis and without taking the same file twice.
 */
async function claim(): Promise<Asset | null> {
  const rows = await prisma.$queryRaw<Asset[]>`
    UPDATE "Asset" SET state = 'RUNNING', progress = 1, attempts = attempts + 1, rev = rev + 1,
                       "heartbeatAt" = now(), error = NULL, "updatedAt" = now()
    WHERE id = (
      SELECT id FROM "Asset"
      WHERE state = 'PENDING' AND ("retryAt" IS NULL OR "retryAt" <= now())
      ORDER BY "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *`;
  return rows[0] ?? null;
}

async function processOne(asset: Asset) {
  const started = Date.now();
  const prefix = `a/${asset.id}/${asset.rev}/`;
  let lastPct = 0;
  const job: Job = {
    asset,
    rev: asset.rev,
    prefix,
    progress: async (pct) => {
      const p = Math.max(1, Math.min(99, Math.round(pct)));
      if (p <= lastPct) return;
      lastPct = p;
      await prisma.asset.update({ where: { id: asset.id }, data: { progress: p, heartbeatAt: new Date() } }).catch(() => undefined);
    },
  };
  const heartbeat = setInterval(() => {
    void prisma.asset.update({ where: { id: asset.id }, data: { heartbeatAt: new Date() } }).catch(() => undefined);
  }, 20_000);

  log('job', `${asset.id} ${asset.kind} "${asset.title}" rev ${asset.rev}, attempt ${asset.attempts}`);
  try {
    const result =
      asset.kind === 'VIDEO' ? await processVideo(job) : asset.kind === 'PANORAMA' ? await processPanorama(job) : await processPhoto(job);
    // The file may have been deleted from the library while it was processing
    const still = await prisma.asset.findUnique({ where: { id: asset.id }, select: { rev: true } });
    if (!still || still.rev !== asset.rev) {
      await deleteMediaPrefix(prefix);
      log('job', `${asset.id}: superseded or deleted, output discarded`);
      return;
    }
    await prisma.asset.update({
      where: { id: asset.id },
      data: {
        ...result.patch,
        derived: result.derived as unknown as Prisma.InputJsonValue,
        state: 'READY',
        progress: 100,
        error: null,
        retryAt: null,
        processedAt: new Date(),
      },
    });
    // Previous revisions are no longer referenced; the CDN may still serve them until purged, which is harmless
    await deleteMediaPrefix(`a/${asset.id}/`, prefix).catch((e) => log('job', `${asset.id}: cleanup failed: ${(e as Error).message}`));
    await revalidateWeb();
    log('job', `${asset.id}: ready in ${Math.round((Date.now() - started) / 1000)} s`);
  } catch (e) {
    const message = ((e as Error).message ?? String(e)).slice(0, 1000);
    const final = PERMANENT.test(message) || asset.attempts >= cfg.maxAttempts;
    log('job', `${asset.id}: ${final ? 'failed' : 'will retry'}: ${message}`);
    await deleteMediaPrefix(prefix).catch(() => undefined);
    await prisma.asset
      .update({
        where: { id: asset.id },
        data: final
          ? { state: 'FAILED', error: message, progress: 0 }
          : { state: 'PENDING', error: message, progress: 0, retryAt: new Date(Date.now() + 30_000 * 2 ** (asset.attempts - 1)) },
      })
      .catch(() => undefined);
  } finally {
    clearInterval(heartbeat);
  }
}

/** Fresh media must appear on the public site without waiting for its cache to expire */
async function revalidateWeb() {
  const url = process.env.WEB_INTERNAL_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!url || !secret) return;
  await fetch(`${url.replace(/\/$/, '')}/hooks/revalidate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
    body: JSON.stringify({ tags: ['locations', 'home', 'services'] }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined);
}

async function housekeeping() {
  // Abandoned jobs go back to the queue
  const recovered = await prisma.$executeRaw`
    UPDATE "Asset" SET state = 'PENDING', "retryAt" = now()
    WHERE state = 'RUNNING' AND "heartbeatAt" < now() - make_interval(secs => ${STALE_SEC})`;
  if (recovered) log('housekeeping', `${recovered} stalled job(s) returned to the queue`);

  // Uploads nobody finished
  const stale = await prisma.asset.findMany({
    where: { state: 'UPLOADING', createdAt: { lt: new Date(Date.now() - cfg.uploadTtlDays * 86400_000) } },
    select: { id: true, originalKey: true, uploadId: true },
    take: 100,
  });
  for (const a of stale) {
    if (a.uploadId) await abortUpload(a.originalKey, a.uploadId).catch(() => undefined);
    await prisma.asset.delete({ where: { id: a.id } }).catch(() => undefined);
  }
  if (stale.length) log('housekeeping', `${stale.length} abandoned upload(s) removed`);
}

async function loop() {
  let lastHousekeeping = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastHousekeeping > 60_000) {
        lastHousekeeping = Date.now();
        await housekeeping();
      }
      while (!stopping && running < cfg.concurrency) {
        const asset = await claim();
        if (!asset) break;
        running++;
        void processOne(asset).finally(() => running--);
      }
    } catch (e) {
      log('worker', `poll error: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, cfg.pollMs));
  }
}

async function main() {
  await mkdir(cfg.workDir, { recursive: true });
  log('worker', `started: ${cfg.concurrency} job(s) at a time, x264 preset ${cfg.x264Preset}`);
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    log('worker', 'stopping…');
    // Running jobs are left RUNNING; their heartbeat stops and housekeeping requeues them
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  await loop();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

