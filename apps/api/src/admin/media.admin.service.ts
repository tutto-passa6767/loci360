import { Injectable } from '@nestjs/common';
import type { AssetKind, Prisma } from '@loci/db';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { AuthUser } from '../auth/auth.types';
import { cfg } from '../config';
import { AuditService } from '../common/audit.service';
import { AppError, notFound } from '../common/errors';
import { MediaPresenter } from '../common/media.presenter';
import { PrismaService } from '../common/prisma.service';
import { RevalidateService } from '../common/revalidate.service';
import { S3Service } from '../common/s3.service';
import { AssetPatchDto, AssetsQuery, StartUploadDto } from './admin.dto';
import { ASSET_ADMIN_SELECT, presentAsset } from './asset.admin';

const MiB = 1024 * 1024;
const S3_MAX_PARTS = 10_000;

const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'mkv', 'mxf', 'avi', 'webm'];
const PHOTO_EXT = ['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'heic', 'heif'];

const extensionOf = (name: string) => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
};

/** Name without path parts and control characters; keeps Unicode */
const cleanName = (name: string) =>
  name
    .replace(/^.*[\\/]/, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 255) || 'file';

/**
 * Media library. Masters go straight from the browser to storage in parts via presigned URLs —
 * the API only manages the session and never proxies the bytes. The worker picks up PENDING assets.
 */
@Injectable()
export class MediaAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly media: MediaPresenter,
    private readonly audit: AuditService,
    private readonly revalidate: RevalidateService,
  ) {}

  async list(q: AssetsQuery) {
    const limit = q.limit ?? 60;
    const page = q.page ?? 1;
    const where: Prisma.AssetWhereInput = {
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.state ? { state: q.state as any } : { state: { not: 'UPLOADING' } }),
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { originalName: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.asset.count({ where }),
      this.prisma.asset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: { ...ASSET_ADMIN_SELECT, _count: { select: { locationMedia: true } } },
      }),
    ]);
    return {
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      items: rows.map(({ _count, ...a }) => presentAsset(this.media, a, _count.locationMedia)),
    };
  }

  /** Current state of several assets (the library polls this while files are processing) */
  async states(ids: string[]) {
    const rows = await this.prisma.asset.findMany({ where: { id: { in: ids.slice(0, 200) } }, select: ASSET_ADMIN_SELECT });
    return { items: rows.map((a) => presentAsset(this.media, a)) };
  }

  async get(id: string) {
    const a = await this.prisma.asset.findUnique({
      where: { id },
      select: {
        ...ASSET_ADMIN_SELECT,
        meta: true,
        originalKey: true,
        locationMedia: { select: { role: true, location: { select: { id: true, nameEn: true, slug: true } } } },
      },
    });
    if (!a) throw notFound('File');
    const { meta, originalKey, locationMedia, ...rest } = a;
    return {
      ...presentAsset(this.media, rest, locationMedia.length),
      meta,
      usedIn: locationMedia.map((m) => ({ ...m.location, role: m.role })),
      originalUrl: rest.state === 'UPLOADING' ? null : await this.s3.presignOriginal(originalKey, rest.originalName, cfg.signedUrlTtlSec),
    };
  }

  async update(id: string, dto: AssetPatchDto, user: AuthUser, req: Request) {
    const a = await this.prisma.asset.findUnique({ where: { id }, select: { kind: true, watermark: true, state: true } });
    if (!a) throw notFound('File');
    // A video with a different watermark setting has to be encoded again
    const reencode = a.kind === 'VIDEO' && dto.watermark !== undefined && dto.watermark !== a.watermark && a.state !== 'UPLOADING';
    await this.prisma.asset.update({
      where: { id },
      data: { ...dto, ...(reencode ? { state: 'PENDING', progress: 0, error: null, attempts: 0, retryAt: null } : {}) },
    });
    await this.audit.record({ action: 'asset.updated', actorId: user.id, targetType: 'asset', targetId: id, req, meta: { fields: Object.keys(dto), reencode } });
    this.revalidate.tags('locations', 'home');
    return this.get(id);
  }

  async reprocess(id: string, user: AuthUser, req: Request) {
    const a = await this.prisma.asset.findUnique({ where: { id }, select: { state: true } });
    if (!a) throw notFound('File');
    if (a.state === 'UPLOADING') throw new AppError(409, 'UPLOAD_NOT_FINISHED', 'The upload has not finished');
    await this.prisma.asset.update({ where: { id }, data: { state: 'PENDING', progress: 0, error: null, attempts: 0, retryAt: null } });
    await this.audit.record({ action: 'asset.reprocess', actorId: user.id, targetType: 'asset', targetId: id, req });
    return this.get(id);
  }

  async remove(id: string, user: AuthUser, req: Request) {
    const a = await this.prisma.asset.findUnique({ where: { id }, select: { originalKey: true, uploadId: true, title: true } });
    if (!a) throw notFound('File');
    // Links from locations are removed by the cascade; covers and OG images fall back to null
    await this.prisma.asset.delete({ where: { id } });
    if (a.uploadId) await this.s3.abortMultipart(a.originalKey, a.uploadId).catch(() => undefined);
    await this.s3.deleteObject(this.s3.originals, a.originalKey).catch(() => undefined);
    await this.s3.deletePrefix(this.s3.media, `a/${id}/`).catch(() => undefined);
    await this.audit.record({ action: 'asset.deleted', actorId: user.id, targetType: 'asset', targetId: id, req, meta: { title: a.title } });
    this.revalidate.tags('locations', 'home', 'services');
    return { ok: true };
  }

  // ------------------------------------------------------------ uploads

  async startUpload(dto: StartUploadDto, user: AuthUser, req: Request) {
    const fileName = cleanName(dto.fileName);
    const ext = extensionOf(fileName);
    const detected: AssetKind | null = VIDEO_EXT.includes(ext) ? 'VIDEO' : PHOTO_EXT.includes(ext) ? 'PHOTO' : null;
    if (!detected) throw new AppError(415, 'FORMAT_NOT_ALLOWED', 'Upload a video (MP4, MOV, MXF…) or a photo (JPEG, PNG, TIFF, HEIC)', { extension: ext });
    const kind: AssetKind = dto.kind === 'PANORAMA' && detected === 'PHOTO' ? 'PANORAMA' : detected;
    if (dto.size > cfg.upload.maxBytes) throw new AppError(413, 'FILE_TOO_LARGE', 'File is too large', { maxBytes: cfg.upload.maxBytes });

    // S3 allows at most 10 000 parts — very large files get bigger parts
    const partSize = Math.max(cfg.upload.partSize, Math.ceil(dto.size / S3_MAX_PARTS / MiB) * MiB, 5 * MiB);
    const partsCount = Math.max(1, Math.ceil(dto.size / partSize));
    // Random key: two files with the same name never overwrite each other
    const originalKey = `o/${randomUUID()}${ext ? `.${ext}` : ''}`;
    const uploadId = await this.s3.createMultipart(originalKey);
    const asset = await this.prisma.asset.create({
      data: {
        kind,
        title: fileName.replace(/\.[^.]+$/, ''),
        originalName: fileName,
        originalKey,
        size: BigInt(dto.size),
        mime: dto.mimeType?.slice(0, 200) || null,
        uploadId,
        partSize,
        state: 'UPLOADING',
        watermark: dto.watermark ?? kind === 'VIDEO',
        createdById: user.id,
      },
    });
    await this.audit.record({ action: 'upload.started', actorId: user.id, targetType: 'asset', targetId: asset.id, req, meta: { size: dto.size, kind } });
    return { assetId: asset.id, kind, partSize, partsCount };
  }

  private async uploading(id: string) {
    const a = await this.prisma.asset.findUnique({ where: { id } });
    if (!a) throw notFound('Upload');
    if (a.state !== 'UPLOADING' || !a.uploadId || !a.partSize) throw new AppError(409, 'UPLOAD_NOT_ACTIVE', 'Upload already finished or cancelled');
    return a as typeof a & { uploadId: string; partSize: number };
  }

  async signParts(id: string, partNumbers: number[]) {
    const a = await this.uploading(id);
    const partsCount = Math.max(1, Math.ceil(Number(a.size) / a.partSize));
    const urls: Record<number, string> = {};
    for (const n of new Set(partNumbers)) {
      if (n < 1 || n > partsCount) throw new AppError(400, 'BAD_PART_NUMBER', 'Invalid part number', { partNumber: n });
      urls[n] = await this.s3.presignUploadPart(a.originalKey, a.uploadId, n, cfg.signedUrlTtlSec);
    }
    return { urls, expiresInSec: cfg.signedUrlTtlSec };
  }

  /** Parts the storage already holds — the browser resumes from here after a reload */
  async uploadStatus(id: string) {
    const a = await this.uploading(id);
    const parts = await this.s3.listParts(a.originalKey, a.uploadId).catch((e) => {
      if (e?.name === 'NoSuchUpload') return [];
      throw e;
    });
    return {
      assetId: a.id,
      fileName: a.originalName,
      size: Number(a.size),
      partSize: a.partSize,
      partsCount: Math.max(1, Math.ceil(Number(a.size) / a.partSize)),
      uploaded: parts.map((p) => p.PartNumber!),
    };
  }

  /** Assembles the parts, checks the final size and hands the file to the worker */
  async completeUpload(id: string, user: AuthUser, req: Request) {
    const a = await this.uploading(id);
    const partsCount = Math.max(1, Math.ceil(Number(a.size) / a.partSize));
    const parts = await this.s3.listParts(a.originalKey, a.uploadId);
    const lastSize = Number(a.size) - a.partSize * (partsCount - 1);
    const missing: number[] = [];
    for (let n = 1; n <= partsCount; n++) {
      const p = parts.find((x) => x.PartNumber === n);
      if (!p || Number(p.Size) !== (n === partsCount ? lastSize : a.partSize)) missing.push(n);
    }
    if (missing.length) throw new AppError(409, 'PARTS_MISSING', 'Not every part reached the storage', { missing: missing.slice(0, 100) });

    await this.s3.completeMultipart(
      a.originalKey,
      a.uploadId,
      parts.filter((p) => p.PartNumber! <= partsCount).map((p) => ({ PartNumber: p.PartNumber!, ETag: p.ETag! })),
    );
    const head = await this.s3.headOriginal(a.originalKey);
    if (!head || BigInt(head.size) !== a.size) {
      await this.s3.deleteObject(this.s3.originals, a.originalKey).catch(() => undefined);
      await this.prisma.asset.delete({ where: { id } });
      throw new AppError(422, 'SIZE_MISMATCH', 'Stored file size differs from the original');
    }
    await this.prisma.asset.update({ where: { id }, data: { state: 'PENDING', uploadId: null, progress: 0 } });
    await this.audit.record({ action: 'upload.completed', actorId: user.id, targetType: 'asset', targetId: id, req, meta: { size: Number(a.size), parts: partsCount } });
    return this.get(id);
  }

  async abortUpload(id: string, user: AuthUser, req: Request) {
    const a = await this.prisma.asset.findUnique({ where: { id } });
    if (!a || a.state !== 'UPLOADING') return { ok: true };
    if (a.uploadId) await this.s3.abortMultipart(a.originalKey, a.uploadId);
    await this.prisma.asset.delete({ where: { id } });
    await this.audit.record({ action: 'upload.aborted', actorId: user.id, targetType: 'asset', targetId: id, req });
    return { ok: true };
  }
}
