import { Injectable } from '@nestjs/common';
import { Prisma } from '@loci/db';
import type { AssetKind, MediaRole } from '@loci/db';
import type { Request } from 'express';
import { AuthUser } from '../auth/auth.types';
import { AuditService } from '../common/audit.service';
import { AppError, notFound } from '../common/errors';
import { MediaPresenter } from '../common/media.presenter';
import { guardWrite } from '../common/prisma-errors';
import { PrismaService } from '../common/prisma.service';
import { MediaScoreService } from '../common/media-score.service';
import { embedProvider, parseEmbed } from '../common/panorama-embed';
import { RevalidateService } from '../common/revalidate.service';
import { buildSearchText } from '../public/catalogue.service';
import { AttachMediaDto, LocationDto, LocationMediaDto, LocationsQuery, MediaItemPatchDto, MediaOrderDto, PanoramaEmbedsDto } from './admin.dto';
import { ASSET_ADMIN_SELECT, presentAsset } from './asset.admin';

/** Which asset kinds may fill which role on a location */
const ROLE_KIND: Record<MediaRole, AssetKind> = {
  SHOWREEL: 'VIDEO',
  BROLL: 'VIDEO',
  PHOTO: 'PHOTO',
  PANORAMA: 'PANORAMA',
};

/** Photos with a shorter side below this look soft in the full-width page header (the CMS flags them) */
const SMALL_PHOTO_PX = 1200;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'location';

@Injectable()
export class LocationsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaPresenter,
    private readonly audit: AuditService,
    private readonly revalidate: RevalidateService,
    private readonly scores: MediaScoreService,
  ) {}

  async list(q: LocationsQuery) {
    const limit = q.limit ?? 50;
    const page = q.page ?? 1;
    const where: Prisma.LocationWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.clusterId ? { clusterId: q.clusterId } : {}),
      ...(q.q ? { searchText: { contains: q.q.toLowerCase() } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.location.count({ where }),
      this.prisma.location.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          cluster: { select: { id: true, nameEn: true } },
          cover: { select: ASSET_ADMIN_SELECT },
          media: { select: { role: true, asset: { select: { state: true, width: true, height: true } } } },
          _count: { select: { media: true, leads: true } },
        },
      }),
    ]);
    const stills = (r: (typeof rows)[number], role: MediaRole) => r.media.filter((m) => m.role === role).map((m) => m.asset);
    return {
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      items: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        status: r.status,
        nameEn: r.nameEn,
        nameRu: r.nameRu,
        regionEn: r.regionEn,
        cluster: r.cluster,
        featured: r.featured,
        thumb: this.media.thumb(r.cover, 480),
        mediaCount: r._count.media,
        // Photo & video manager list: how many files of each kind, which are still processing, failed or too small for a sharp page header
        photos: {
          count: stills(r, 'PHOTO').length,
          panoramas: stills(r, 'PANORAMA').length,
          showreels: stills(r, 'SHOWREEL').length,
          broll: stills(r, 'BROLL').length,
          processing: r.media.filter((m) => ['UPLOADING', 'PENDING', 'RUNNING'].includes(m.asset.state)).length,
          failed: r.media.filter((m) => m.asset.state === 'FAILED').length,
          small: stills(r, 'PHOTO').filter((a) => a.width && a.height && Math.min(a.width, a.height) < SMALL_PHOTO_PX).length,
        },
        leadCount: r._count.leads,
        updatedAt: r.updatedAt,
        publishedAt: r.publishedAt,
      })),
    };
  }

  async get(id: string) {
    const row = await this.prisma.location.findUnique({
      where: { id },
      include: {
        terms: { select: { termId: true } },
        cover: { select: ASSET_ADMIN_SELECT },
        og: { select: ASSET_ADMIN_SELECT },
        media: { orderBy: { sort: 'asc' }, include: { asset: { select: { ...ASSET_ADMIN_SELECT, heroReels: { select: { labelRu: true, locationSlug: true } } } } } },
        panoramaEmbeds: { orderBy: { sort: 'asc' } },
      },
    });
    if (!row) throw notFound('Location');
    const { terms, cover, og, media, panoramaEmbeds, searchText: _s, ...fields } = row;
    return {
      ...fields,
      panoramaEmbeds: panoramaEmbeds.map((e) => ({ id: e.id, src: e.src, provider: embedProvider(e.src), labelEn: e.labelEn, labelRu: e.labelRu, credit: e.credit })),
      termIds: terms.map((t) => t.termId),
      cover: cover ? presentAsset(this.media, cover) : null,
      og: og ? presentAsset(this.media, og) : null,
      media: media.map((m) => ({
        assetId: m.assetId,
        role: m.role,
        timeOfDay: m.timeOfDay,
        labelEn: m.labelEn,
        labelRu: m.labelRu,
        asset: presentAsset(this.media, m.asset),
        // Home-page hero moods that credit this location and play this video (a replaced showreel takes them over)
        onHome: m.asset.heroReels.filter((h) => h.locationSlug === fields.slug).map((h) => h.labelRu),
      })),
    };
  }

  async create(dto: LocationDto, user: AuthUser, req: Request) {
    if (!dto.nameEn) throw new AppError(400, 'NAME_REQUIRED', 'English name is required', { fields: ['nameEn'] });
    if (dto.lat === undefined || dto.lng === undefined) {
      throw new AppError(400, 'COORDINATES_REQUIRED', 'Set the location on the map', { fields: ['lat', 'lng'] });
    }
    const { termIds, ...data } = dto;
    const slug = dto.slug ?? (await this.freeSlug(slugify(dto.nameEn)));
    const row = await guardWrite(
      () =>
        this.prisma.location.create({
          data: {
            ...data,
            slug,
            nameEn: dto.nameEn!,
            nameRu: dto.nameRu ?? '',
            summaryEn: dto.summaryEn ?? '',
            summaryRu: dto.summaryRu ?? '',
            lat: dto.lat!,
            lng: dto.lng!,
            publishedAt: dto.status === 'PUBLISHED' ? new Date() : null,
            terms: termIds?.length ? { create: termIds.map((termId) => ({ termId })) } : undefined,
          },
        }),
      'Location',
    );
    await this.refreshSearchText(row.id);
    await this.audit.record({ action: 'location.created', actorId: user.id, targetType: 'location', targetId: row.id, req, meta: { slug } });
    this.revalidate.tags('locations', 'taxonomy', 'home');
    return this.get(row.id);
  }

  async update(id: string, dto: LocationDto, user: AuthUser, req: Request) {
    const current = await this.prisma.location.findUnique({ where: { id }, select: { status: true, publishedAt: true, slug: true, lat: true, lng: true, elevationM: true } });
    if (!current) throw notFound('Location');
    const { termIds, ...data } = dto;
    // A moved pin or a new elevation makes the stored weather normals wrong: drop them, the next visit recomputes
    const moved =
      (dto.lat !== undefined && dto.lat !== current.lat) || (dto.lng !== undefined && dto.lng !== current.lng) || (dto.elevationM !== undefined && dto.elevationM !== current.elevationM);
    await guardWrite(
      () =>
        this.prisma.$transaction(async (tx) => {
          if (termIds) {
            await tx.locationTerm.deleteMany({ where: { locationId: id } });
            if (termIds.length) await tx.locationTerm.createMany({ data: termIds.map((termId) => ({ locationId: id, termId })), skipDuplicates: true });
          }
          await tx.location.update({
            where: { id },
            data: {
              ...data,
              ...(moved ? { climateMonthly: Prisma.DbNull } : {}),
              ...(dto.status === 'PUBLISHED' && !current.publishedAt ? { publishedAt: new Date() } : {}),
            },
          });
        }),
      'Location',
    );
    await this.refreshSearchText(id);
    const action = dto.status && dto.status !== current.status ? `location.${dto.status.toLowerCase()}` : 'location.updated';
    await this.audit.record({ action, actorId: user.id, targetType: 'location', targetId: id, req, meta: { fields: Object.keys(dto) } });
    if (dto.coverAssetId !== undefined) await this.scores.refresh([id]);
    this.revalidate.tags('locations', 'taxonomy', 'home');
    return this.get(id);
  }

  async remove(id: string, user: AuthUser, req: Request) {
    const row = await this.prisma.location.findUnique({ where: { id }, select: { slug: true, nameEn: true } });
    if (!row) throw notFound('Location');
    // Media files stay in the library; only the links to this location go away
    await this.prisma.location.delete({ where: { id } });
    await this.audit.record({ action: 'location.deleted', actorId: user.id, targetType: 'location', targetId: id, req, meta: row });
    this.revalidate.tags('locations', 'taxonomy', 'home');
    return { ok: true };
  }

  /** Replaces the ordered media list; roles must match asset kinds */
  /** Replaces the location's hosted 360° views; every code is checked against the allowed panorama services */
  async setEmbeds(id: string, dto: PanoramaEmbedsDto, user: AuthUser, req: Request) {
    if (!(await this.prisma.location.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Location');
    const items = dto.items.map((x, i) => ({
      locationId: id,
      src: parseEmbed(x.code, `items.${i}.code`),
      labelEn: x.labelEn || null,
      labelRu: x.labelRu || null,
      credit: x.credit || null,
      sort: i,
    }));
    await this.prisma.$transaction([
      this.prisma.panoramaEmbed.deleteMany({ where: { locationId: id } }),
      this.prisma.panoramaEmbed.createMany({ data: items }),
      this.prisma.location.update({ where: { id }, data: { updatedAt: new Date() } }),
    ]);
    await this.audit.record({ action: 'location.embeds_updated', actorId: user.id, targetType: 'location', targetId: id, req, meta: { count: items.length } });
    await this.scores.refresh([id]);
    this.revalidate.tags('locations', 'home');
    return this.get(id);
  }

  async setMedia(id: string, dto: LocationMediaDto, user: AuthUser, req: Request) {
    const loc = await this.prisma.location.findUnique({ where: { id }, select: { coverAssetId: true } });
    if (!loc) throw notFound('Location');
    const ids = [...new Set(dto.items.map((i) => i.assetId))];
    if (ids.length !== dto.items.length) throw new AppError(400, 'DUPLICATE_MEDIA', 'The same file is attached twice');
    const assets = await this.prisma.asset.findMany({ where: { id: { in: ids } }, select: { id: true, kind: true } });
    for (const item of dto.items) {
      const a = assets.find((x) => x.id === item.assetId);
      if (!a) throw new AppError(400, 'ASSET_NOT_FOUND', 'File not found in the media library', { assetId: item.assetId });
      if (ROLE_KIND[item.role] !== a.kind) {
        throw new AppError(400, 'ROLE_KIND_MISMATCH', `A ${a.kind.toLowerCase()} cannot be used as ${item.role.toLowerCase()}`, { assetId: a.id });
      }
    }
    const firstPhoto = dto.items.find((i) => i.role === 'PHOTO')?.assetId ?? null;
    await this.prisma.$transaction([
      this.prisma.locationMedia.deleteMany({ where: { locationId: id } }),
      this.prisma.locationMedia.createMany({
        data: dto.items.map((i, sort) => ({
          locationId: id,
          assetId: i.assetId,
          role: i.role,
          timeOfDay: i.role === 'PHOTO' ? (i.timeOfDay ?? null) : null,
          labelEn: i.labelEn ?? null,
          labelRu: i.labelRu ?? null,
          sort,
        })),
      }),
      // Touching updatedAt also invalidates cached PDF spec sheets
      this.prisma.location.update({
        where: { id },
        data: { updatedAt: new Date(), ...(loc.coverAssetId ? {} : { coverAssetId: firstPhoto }) },
      }),
    ]);
    await this.audit.record({ action: 'location.media_updated', actorId: user.id, targetType: 'location', targetId: id, req, meta: { count: dto.items.length } });
    await this.scores.refresh([id]);
    this.revalidate.tags('locations', 'home');
    return this.get(id);
  }

  // ------------------------------------------------ one file at a time (photo manager, saves every action at once)

  /** Adds an uploaded file, or puts it in place of another one: position, time of day, labels, cover and OG move over */
  async attachMedia(id: string, dto: AttachMediaDto, user: AuthUser, req: Request) {
    const loc = await this.prisma.location.findUnique({ where: { id }, select: { slug: true, coverAssetId: true, ogAssetId: true } });
    if (!loc) throw notFound('Location');
    const asset = await this.prisma.asset.findUnique({ where: { id: dto.assetId }, select: { id: true, kind: true } });
    if (!asset) throw new AppError(400, 'ASSET_NOT_FOUND', 'File not found in the media library', { assetId: dto.assetId });
    const rows = await this.prisma.locationMedia.findMany({ where: { locationId: id }, orderBy: { sort: 'asc' } });
    // A retried request after a network error must not fail
    if (rows.some((r) => r.assetId === asset.id)) return this.get(id);

    const old = dto.replaceAssetId ? rows.find((r) => r.assetId === dto.replaceAssetId) : undefined;
    const role: MediaRole =
      old?.role ??
      dto.role ??
      (asset.kind === 'VIDEO' ? (rows.some((r) => r.role === 'SHOWREEL') ? 'BROLL' : 'SHOWREEL') : asset.kind === 'PANORAMA' ? 'PANORAMA' : 'PHOTO');
    if (ROLE_KIND[role] !== asset.kind) {
      throw new AppError(400, 'ROLE_KIND_MISMATCH', `A ${asset.kind.toLowerCase()} cannot be used as ${role.toLowerCase()}`, { assetId: asset.id });
    }
    // A replaced file hands over the cover (same kind, so a video cover stays a video); a new cover must be a photo
    const replacesCover = !!dto.replaceAssetId && dto.replaceAssetId === loc.coverAssetId;
    if ((dto.cover || (replacesCover && !old)) && asset.kind !== 'PHOTO') throw new AppError(400, 'COVER_NOT_PHOTO', 'Only a photo can be the cover');
    const cover = dto.cover || replacesCover || (!loc.coverAssetId && asset.kind === 'PHOTO');

    await this.prisma.$transaction([
      // A replaced showreel also takes over the home-page hero moods that credit this location and played it
      ...(old && asset.kind === 'VIDEO'
        ? [this.prisma.heroReel.updateMany({ where: { assetId: old.assetId, locationSlug: loc.slug }, data: { assetId: asset.id } })]
        : []),
      old
        ? this.prisma.locationMedia.update({ where: { id: old.id }, data: { assetId: asset.id, ...(dto.timeOfDay && old.role === 'PHOTO' ? { timeOfDay: dto.timeOfDay } : {}) } })
        : this.prisma.locationMedia.create({
            data: {
              locationId: id,
              assetId: asset.id,
              role,
              timeOfDay: role === 'PHOTO' ? (dto.timeOfDay ?? 'DAY') : null,
              sort: (rows.at(-1)?.sort ?? -1) + 1,
            },
          }),
      this.prisma.location.update({
        where: { id },
        data: {
          updatedAt: new Date(),
          ...(cover ? { coverAssetId: asset.id } : {}),
          ...(dto.replaceAssetId && dto.replaceAssetId === loc.ogAssetId ? { ogAssetId: asset.id } : {}),
        },
      }),
    ]);
    const action = dto.replaceAssetId ? 'location.media_replaced' : 'location.media_added';
    return this.mediaChanged(id, action, user, req, { assetId: asset.id, replaced: dto.replaceAssetId ?? null, cover });
  }

  /** Showreel ↔ B-roll, time of day, labels, or "make this photo the cover" */
  async patchMedia(id: string, assetId: string, dto: MediaItemPatchDto, user: AuthUser, req: Request) {
    const row = await this.prisma.locationMedia.findUnique({ where: { locationId_assetId: { locationId: id, assetId } }, include: { asset: { select: { kind: true } } } });
    if (!row) throw notFound('Media item');
    if (dto.cover && row.asset.kind !== 'PHOTO') throw new AppError(400, 'COVER_NOT_PHOTO', 'Only a photo can be the cover');
    if (dto.role && ROLE_KIND[dto.role] !== row.asset.kind) {
      throw new AppError(400, 'ROLE_KIND_MISMATCH', `A ${row.asset.kind.toLowerCase()} cannot be used as ${dto.role.toLowerCase()}`, { assetId });
    }
    await this.prisma.$transaction([
      this.prisma.locationMedia.update({
        where: { id: row.id },
        data: {
          ...(dto.role ? { role: dto.role } : {}),
          ...(dto.timeOfDay !== undefined && row.role === 'PHOTO' ? { timeOfDay: dto.timeOfDay } : {}),
          ...(dto.labelEn !== undefined ? { labelEn: dto.labelEn } : {}),
          ...(dto.labelRu !== undefined ? { labelRu: dto.labelRu } : {}),
        },
      }),
      this.prisma.location.update({ where: { id }, data: { updatedAt: new Date(), ...(dto.cover ? { coverAssetId: assetId } : {}) } }),
    ]);
    return this.mediaChanged(id, dto.cover ? 'location.cover_changed' : 'location.media_updated', user, req, { assetId, fields: Object.keys(dto) });
  }

  /** Takes a file off the location; it stays in the media library. A removed cover passes to the next photo */
  async detachMedia(id: string, assetId: string, user: AuthUser, req: Request) {
    const loc = await this.prisma.location.findUnique({ where: { id }, select: { coverAssetId: true, ogAssetId: true } });
    if (!loc) throw notFound('Location');
    const row = await this.prisma.locationMedia.findUnique({ where: { locationId_assetId: { locationId: id, assetId } } });
    if (!row) throw notFound('Media item');
    const nextCover =
      loc.coverAssetId === assetId
        ? ((await this.prisma.locationMedia.findFirst({ where: { locationId: id, role: 'PHOTO', assetId: { not: assetId } }, orderBy: { sort: 'asc' }, select: { assetId: true } }))?.assetId ?? null)
        : undefined;
    await this.prisma.$transaction([
      this.prisma.locationMedia.delete({ where: { id: row.id } }),
      this.prisma.location.update({
        where: { id },
        data: { updatedAt: new Date(), ...(nextCover !== undefined ? { coverAssetId: nextCover } : {}), ...(loc.ogAssetId === assetId ? { ogAssetId: null } : {}) },
      }),
    ]);
    return this.mediaChanged(id, 'location.media_removed', user, req, { assetId });
  }

  /** Reorders the given files among the places they already hold, so photos move without shifting videos or panoramas */
  async orderMedia(id: string, dto: MediaOrderDto, user: AuthUser, req: Request) {
    if (!(await this.prisma.location.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Location');
    const rows = await this.prisma.locationMedia.findMany({ where: { locationId: id }, orderBy: { sort: 'asc' } });
    const wanted = [...new Set(dto.assetIds)].map((a) => rows.find((r) => r.assetId === a));
    if (wanted.some((r) => !r)) throw new AppError(400, 'ASSET_NOT_FOUND', 'File is not attached to this location');
    const ids = new Set(dto.assetIds);
    const next = [...rows];
    rows.forEach((r, slot) => ids.has(r.assetId) && (next[slot] = wanted.shift()!));
    await this.prisma.$transaction([
      ...next.map((r, sort) => this.prisma.locationMedia.update({ where: { id: r.id }, data: { sort } })),
      this.prisma.location.update({ where: { id }, data: { updatedAt: new Date() } }),
    ]);
    return this.mediaChanged(id, 'location.media_reordered', user, req, { count: dto.assetIds.length });
  }

  private async mediaChanged(id: string, action: string, user: AuthUser, req: Request, meta: Record<string, unknown>) {
    await this.audit.record({ action, actorId: user.id, targetType: 'location', targetId: id, req, meta });
    await this.scores.refresh([id]);
    this.revalidate.tags('locations', 'home');
    return this.get(id);
  }

  async refreshSearchText(id: string) {
    const row = await this.prisma.location.findUniqueOrThrow({
      where: { id },
      include: { terms: { include: { term: true } }, cluster: { select: { nameEn: true, nameRu: true } } },
    });
    await this.prisma.location.update({
      where: { id },
      data: { searchText: buildSearchText(row, row.terms.map((t) => t.term), row.cluster), updatedAt: row.updatedAt },
    });
  }

  private async freeSlug(base: string) {
    for (let i = 0; i < 50; i++) {
      const slug = i ? `${base}-${i + 1}` : base;
      if (!(await this.prisma.location.findUnique({ where: { slug }, select: { id: true } }))) return slug;
    }
    return `${base}-${Date.now().toString(36)}`;
  }
}
