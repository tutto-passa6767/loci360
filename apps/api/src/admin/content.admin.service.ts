import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser } from '../auth/auth.types';
import { AuditService } from '../common/audit.service';
import { AppError, notFound } from '../common/errors';
import { MediaPresenter } from '../common/media.presenter';
import { guardWrite } from '../common/prisma-errors';
import { PrismaService } from '../common/prisma.service';
import { RevalidateService } from '../common/revalidate.service';
import { GA4_ID, METRIKA_ID, SettingKey, SettingsService, SiteSettings } from '../common/settings.service';
import { ClusterDto, HeroDto, PageDto, ServiceCompanyDto, TermDto } from './admin.dto';
import { ASSET_ADMIN_SELECT, presentAsset } from './asset.admin';
import { LocationsAdminService } from './locations.admin.service';

/** Taxonomy, clusters, home hero, editorial pages, service registry and settings */
@Injectable()
export class ContentAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaPresenter,
    private readonly audit: AuditService,
    private readonly revalidate: RevalidateService,
    private readonly settings: SettingsService,
    private readonly locations: LocationsAdminService,
  ) {}

  /** Term and cluster names are part of every location's search text */
  private async refreshAllSearchText() {
    const ids = await this.prisma.location.findMany({ select: { id: true } });
    for (const { id } of ids) await this.locations.refreshSearchText(id);
  }

  // ------------------------------------------------------------ terms

  async terms() {
    const rows = await this.prisma.term.findMany({
      orderBy: [{ kind: 'asc' }, { sort: 'asc' }, { labelEn: 'asc' }],
      include: { _count: { select: { locations: true } } },
    });
    return { items: rows.map(({ _count, ...t }) => ({ ...t, usage: _count.locations })) };
  }

  async createTerm(dto: TermDto, user: AuthUser, req: Request) {
    if (!dto.kind || !dto.slug || !dto.labelEn) throw new AppError(400, 'FIELDS_REQUIRED', 'Kind, slug and English label are required');
    const row = await guardWrite(
      () => this.prisma.term.create({ data: { kind: dto.kind!, slug: dto.slug!, labelEn: dto.labelEn!, labelRu: dto.labelRu ?? '', sort: dto.sort ?? 0 } }),
      'Term',
    );
    await this.audit.record({ action: 'term.created', actorId: user.id, targetType: 'term', targetId: row.id, req, meta: { slug: row.slug } });
    this.revalidate.tags('taxonomy', 'home');
    return row;
  }

  async updateTerm(id: string, dto: TermDto, user: AuthUser, req: Request) {
    const row = await guardWrite(() => this.prisma.term.update({ where: { id }, data: dto }), 'Term');
    if (dto.labelEn !== undefined || dto.labelRu !== undefined || dto.slug !== undefined) await this.refreshAllSearchText();
    await this.audit.record({ action: 'term.updated', actorId: user.id, targetType: 'term', targetId: id, req });
    this.revalidate.tags('taxonomy', 'locations', 'home');
    return row;
  }

  async deleteTerm(id: string, user: AuthUser, req: Request) {
    await guardWrite(() => this.prisma.term.delete({ where: { id } }), 'Term');
    await this.refreshAllSearchText();
    await this.audit.record({ action: 'term.deleted', actorId: user.id, targetType: 'term', targetId: id, req });
    this.revalidate.tags('taxonomy', 'locations', 'home');
    return { ok: true };
  }

  // ------------------------------------------------------------ clusters

  async clusters() {
    const rows = await this.prisma.cluster.findMany({
      orderBy: { sort: 'asc' },
      include: { cover: { select: ASSET_ADMIN_SELECT }, _count: { select: { locations: true } } },
    });
    return { items: rows.map(({ cover, _count, ...c }) => ({ ...c, cover: cover ? presentAsset(this.media, cover) : null, usage: _count.locations })) };
  }

  async createCluster(dto: ClusterDto, user: AuthUser, req: Request) {
    if (!dto.slug || !dto.nameEn || dto.lat === undefined || dto.lng === undefined) {
      throw new AppError(400, 'FIELDS_REQUIRED', 'Slug, English name and map centre are required');
    }
    const row = await guardWrite(
      () =>
        this.prisma.cluster.create({
          data: {
            ...dto,
            slug: dto.slug!,
            nameEn: dto.nameEn!,
            nameRu: dto.nameRu ?? '',
            taglineEn: dto.taglineEn ?? '',
            taglineRu: dto.taglineRu ?? '',
            lat: dto.lat!,
            lng: dto.lng!,
          },
        }),
      'Cluster',
    );
    await this.audit.record({ action: 'cluster.created', actorId: user.id, targetType: 'cluster', targetId: row.id, req });
    this.revalidate.tags('taxonomy', 'home');
    return row;
  }

  async updateCluster(id: string, dto: ClusterDto, user: AuthUser, req: Request) {
    const row = await guardWrite(() => this.prisma.cluster.update({ where: { id }, data: dto }), 'Cluster');
    if (dto.nameEn !== undefined || dto.nameRu !== undefined) await this.refreshAllSearchText();
    await this.audit.record({ action: 'cluster.updated', actorId: user.id, targetType: 'cluster', targetId: id, req });
    this.revalidate.tags('taxonomy', 'locations', 'home');
    return row;
  }

  async deleteCluster(id: string, user: AuthUser, req: Request) {
    await guardWrite(() => this.prisma.cluster.delete({ where: { id } }), 'Cluster');
    await this.refreshAllSearchText();
    await this.audit.record({ action: 'cluster.deleted', actorId: user.id, targetType: 'cluster', targetId: id, req });
    this.revalidate.tags('taxonomy', 'locations', 'home');
    return { ok: true };
  }

  // ------------------------------------------------------------ home hero

  async hero() {
    const rows = await this.prisma.heroReel.findMany({ orderBy: { sort: 'asc' }, include: { asset: { select: ASSET_ADMIN_SELECT } } });
    return { items: rows.map(({ asset, ...r }) => ({ ...r, asset: asset ? presentAsset(this.media, asset) : null })) };
  }

  async setHero(dto: HeroDto, user: AuthUser, req: Request) {
    const keys = new Set(dto.items.map((i) => i.key));
    if (keys.size !== dto.items.length) throw new AppError(400, 'DUPLICATE_KEY', 'Each genre mood needs its own key');
    const assetIds = dto.items.map((i) => i.assetId).filter((x): x is string => !!x);
    const videos = await this.prisma.asset.count({ where: { id: { in: assetIds }, kind: 'VIDEO' } });
    if (videos !== assetIds.length) throw new AppError(400, 'NOT_A_VIDEO', 'Hero moods take videos only');
    await this.prisma.$transaction([
      this.prisma.heroReel.deleteMany({}),
      this.prisma.heroReel.createMany({
        data: dto.items.map((i, sort) => ({
          key: i.key,
          labelEn: i.labelEn,
          labelRu: i.labelRu,
          assetId: i.assetId ?? null,
          genreSlug: i.genreSlug ?? null,
          locationSlug: i.locationSlug ?? null,
          active: i.active ?? true,
          sort,
        })),
      }),
    ]);
    await this.audit.record({ action: 'hero.updated', actorId: user.id, req, meta: { count: dto.items.length } });
    this.revalidate.tags('home');
    return this.hero();
  }

  // ------------------------------------------------------------ pages

  async pages() {
    const rows = await this.prisma.page.findMany({ orderBy: { slug: 'asc' }, select: { id: true, slug: true, titleEn: true, titleRu: true, published: true, updatedAt: true } });
    return { items: rows };
  }

  async page(slug: string) {
    const p = await this.prisma.page.findUnique({ where: { slug }, include: { og: { select: ASSET_ADMIN_SELECT } } });
    if (!p) throw notFound('Page');
    const { og, ...rest } = p;
    return { ...rest, og: og ? presentAsset(this.media, og) : null };
  }

  async updatePage(slug: string, dto: PageDto, user: AuthUser, req: Request) {
    await guardWrite(() => this.prisma.page.update({ where: { slug }, data: dto }), 'Page');
    await this.audit.record({ action: 'page.updated', actorId: user.id, targetType: 'page', targetId: slug, req });
    this.revalidate.tags('pages');
    return this.page(slug);
  }

  // ------------------------------------------------------------ service companies

  async services() {
    const rows = await this.prisma.serviceCompany.findMany({
      orderBy: [{ category: 'asc' }, { sort: 'asc' }, { name: 'asc' }],
      include: { logo: { select: ASSET_ADMIN_SELECT } },
    });
    return { items: rows.map(({ logo, ...s }) => ({ ...s, logo: logo ? presentAsset(this.media, logo) : null })) };
  }

  async createService(dto: ServiceCompanyDto, user: AuthUser, req: Request) {
    if (!dto.name || !dto.category || !dto.cityEn) throw new AppError(400, 'FIELDS_REQUIRED', 'Name, category and city are required');
    const row = await guardWrite(
      () =>
        this.prisma.serviceCompany.create({
          data: { ...dto, name: dto.name!, category: dto.category!, cityEn: dto.cityEn!, cityRu: dto.cityRu ?? '' },
        }),
      'Company',
    );
    await this.audit.record({ action: 'service.created', actorId: user.id, targetType: 'service', targetId: row.id, req });
    this.revalidate.tags('services');
    return row;
  }

  async updateService(id: string, dto: ServiceCompanyDto, user: AuthUser, req: Request) {
    const row = await guardWrite(() => this.prisma.serviceCompany.update({ where: { id }, data: dto }), 'Company');
    await this.audit.record({ action: 'service.updated', actorId: user.id, targetType: 'service', targetId: id, req });
    this.revalidate.tags('services');
    return row;
  }

  async deleteService(id: string, user: AuthUser, req: Request) {
    await guardWrite(() => this.prisma.serviceCompany.delete({ where: { id } }), 'Company');
    await this.audit.record({ action: 'service.deleted', actorId: user.id, targetType: 'service', targetId: id, req });
    this.revalidate.tags('services');
    return { ok: true };
  }

  // ------------------------------------------------------------ settings

  async getSettings() {
    const s = await this.settings.all();
    const [og, photo] = await Promise.all(
      [s.seo.ogAssetId, s.manager.photoAssetId].map((id) => (id ? this.prisma.asset.findUnique({ where: { id }, select: ASSET_ADMIN_SELECT }) : null)),
    );
    return { ...s, ogAsset: og ? presentAsset(this.media, og) : null, managerPhoto: photo ? presentAsset(this.media, photo) : null };
  }

  async setSetting(key: string, value: unknown, user: AuthUser, req: Request) {
    if (!SettingsService.isKey(key)) throw notFound('Setting');
    const clean = validateSetting(key, value);
    await this.settings.set(key, clean as never);
    await this.audit.record({ action: 'settings.updated', actorId: user.id, targetType: 'setting', targetId: key, req });
    this.revalidate.tags('site', 'home');
    return this.getSettings();
  }
}

const str = (v: unknown, max: number, field: string): string => {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string' || v.length > max) throw new AppError(400, 'INVALID_SETTING', `Invalid value for ${field}`, { fields: [field] });
  return v.trim();
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Settings are free-form JSON in the database, so every key gets an explicit shape check here */
function validateSetting(key: SettingKey, value: unknown): SiteSettings[SettingKey] {
  const v = (value ?? {}) as Record<string, unknown>;
  switch (key) {
    case 'contacts':
      return {
        organisationEn: str(v.organisationEn, 160, 'organisationEn'),
        organisationRu: str(v.organisationRu, 160, 'organisationRu'),
        email: str(v.email, 254, 'email'),
        phone: str(v.phone, 40, 'phone'),
        addressEn: str(v.addressEn, 300, 'addressEn'),
        addressRu: str(v.addressRu, 300, 'addressRu'),
        website: str(v.website, 300, 'website'),
      };
    case 'leads': {
      const emails = Array.isArray(v.notifyEmails) ? v.notifyEmails.map((e) => str(e, 254, 'notifyEmails')).filter(Boolean) : [];
      if (emails.some((e) => !EMAIL.test(e))) throw new AppError(400, 'INVALID_EMAIL', 'Check the notification emails', { fields: ['notifyEmails'] });
      return { notifyEmails: emails.slice(0, 20), autoReply: v.autoReply !== false };
    }
    case 'seo':
      return {
        titleEn: str(v.titleEn, 120, 'titleEn'),
        titleRu: str(v.titleRu, 120, 'titleRu'),
        descriptionEn: str(v.descriptionEn, 300, 'descriptionEn'),
        descriptionRu: str(v.descriptionRu, 300, 'descriptionRu'),
        ogAssetId: typeof v.ogAssetId === 'string' && v.ogAssetId ? v.ogAssetId : null,
      };
    case 'social':
      return {
        instagram: str(v.instagram, 300, 'instagram'),
        youtube: str(v.youtube, 300, 'youtube'),
        vimeo: str(v.vimeo, 300, 'vimeo'),
        linkedin: str(v.linkedin, 300, 'linkedin'),
      };
    case 'home': {
      const list = Array.isArray(v.highlights) ? v.highlights.slice(0, 6) : [];
      return {
        highlights: list.map((h: any, i) => ({
          value: str(h?.value, 24, `highlights.${i}.value`),
          labelEn: str(h?.labelEn, 120, `highlights.${i}.labelEn`),
          labelRu: str(h?.labelRu, 120, `highlights.${i}.labelRu`),
        })),
      };
    }
    case 'analytics': {
      const ga4Id = str(v.ga4Id, 20, 'ga4Id').toUpperCase();
      const metrikaId = str(v.metrikaId, 12, 'metrikaId');
      if (ga4Id && !GA4_ID.test(ga4Id)) throw new AppError(400, 'INVALID_SETTING', 'GA4 measurement ID looks like G-XXXXXXXXXX', { fields: ['ga4Id'] });
      if (metrikaId && !METRIKA_ID.test(metrikaId)) throw new AppError(400, 'INVALID_SETTING', 'Yandex Metrica counter is a number', { fields: ['metrikaId'] });
      return { ga4Id, metrikaId };
    }
    case 'manager': {
      const whatsapp = str(v.whatsapp, 20, 'whatsapp').replace(/\D/g, '');
      const telegram = str(v.telegram, 40, 'telegram').replace(/^@/, '');
      if (telegram && !/^[A-Za-z0-9_]{4,32}$/.test(telegram)) throw new AppError(400, 'INVALID_SETTING', 'Telegram username: letters, digits, underscore', { fields: ['telegram'] });
      return {
        nameEn: str(v.nameEn, 80, 'nameEn'),
        nameRu: str(v.nameRu, 80, 'nameRu'),
        roleEn: str(v.roleEn, 80, 'roleEn'),
        roleRu: str(v.roleRu, 80, 'roleRu'),
        photoAssetId: typeof v.photoAssetId === 'string' && v.photoAssetId ? v.photoAssetId : null,
        phone: str(v.phone, 40, 'phone'),
        whatsapp,
        telegram,
      };
    }
    case 'process': {
      const list = Array.isArray(v.steps) ? v.steps.slice(0, 8) : [];
      return {
        steps: list
          .map((x: any, i) => ({
            titleEn: str(x?.titleEn, 60, `steps.${i}.titleEn`),
            titleRu: str(x?.titleRu, 60, `steps.${i}.titleRu`),
            textEn: str(x?.textEn, 400, `steps.${i}.textEn`),
            textRu: str(x?.textRu, 400, `steps.${i}.textRu`),
            durationEn: str(x?.durationEn, 40, `steps.${i}.durationEn`),
            durationRu: str(x?.durationRu, 40, `steps.${i}.durationRu`),
          }))
          .filter((x) => x.titleEn || x.titleRu),
      };
    }
    case 'faq': {
      const list = Array.isArray(v.items) ? v.items.slice(0, 20) : [];
      return {
        items: list
          .map((x: any, i) => ({
            qEn: str(x?.qEn, 200, `items.${i}.qEn`),
            qRu: str(x?.qRu, 200, `items.${i}.qRu`),
            aEn: str(x?.aEn, 1500, `items.${i}.aEn`),
            aRu: str(x?.aRu, 1500, `items.${i}.aRu`),
          }))
          .filter((x) => (x.qEn && x.aEn) || (x.qRu && x.aRu)),
      };
    }
  }
}
