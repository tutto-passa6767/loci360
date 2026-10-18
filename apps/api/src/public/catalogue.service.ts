import { Injectable } from '@nestjs/common';
import type { Prisma, TermKind } from '@loci/db';
import { notFound } from '../common/errors';
import { Lang, tr, trOpt } from '../common/lang';
import { ASSET_PUBLIC_SELECT, MediaPresenter } from '../common/media.presenter';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../common/settings.service';
import { ClimateService } from './climate.service';
import { embedProvider } from '../common/panorama-embed';
import { CatalogueQuery } from './catalogue.dto';

const TERM_GROUPS: { kind: TermKind; key: 'genre' | 'landscape' | 'era' | 'tag' }[] = [
  { kind: 'GENRE', key: 'genre' },
  { kind: 'LANDSCAPE', key: 'landscape' },
  { kind: 'ERA', key: 'era' },
  { kind: 'TAG', key: 'tag' },
];

const CARD_INCLUDE = {
  cluster: { select: { slug: true, nameEn: true, nameRu: true } },
  cover: { select: ASSET_PUBLIC_SELECT },
  terms: { include: { term: true }, orderBy: { term: { sort: 'asc' } } },
  media: {
    where: { role: 'SHOWREEL', asset: { state: 'READY' } },
    orderBy: { sort: 'asc' },
    take: 1,
    include: { asset: { select: ASSET_PUBLIC_SELECT } },
  },
} satisfies Prisma.LocationInclude;

type CardRow = Prisma.LocationGetPayload<{ include: typeof CARD_INCLUDE }>;

/** Lower-cased text the directory search runs over: names, summaries, region, cluster and term labels in both languages */
export function buildSearchText(
  loc: { nameEn: string; nameRu: string; summaryEn: string; summaryRu: string; regionEn?: string | null; regionRu?: string | null; nearestTownEn?: string | null; nearestTownRu?: string | null },
  terms: { labelEn: string; labelRu: string; slug: string }[],
  cluster?: { nameEn: string; nameRu: string } | null,
) {
  return [
    loc.nameEn,
    loc.nameRu,
    loc.summaryEn,
    loc.summaryRu,
    loc.regionEn,
    loc.regionRu,
    loc.nearestTownEn,
    loc.nearestTownRu,
    cluster?.nameEn,
    cluster?.nameRu,
    ...terms.flatMap((t) => [t.labelEn, t.labelRu, t.slug.replace(/-/g, ' ')]),
  ]
    .filter(Boolean)
    .join(' · ')
    .toLowerCase();
}

@Injectable()
export class CatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaPresenter,
    private readonly settings: SettingsService,
    private readonly climate: ClimateService,
  ) {}

  where(q: CatalogueQuery): Prisma.LocationWhereInput {
    const and: Prisma.LocationWhereInput[] = [];
    for (const g of TERM_GROUPS) {
      const slugs = q[g.key];
      if (slugs?.length) and.push({ terms: { some: { term: { kind: g.kind, slug: { in: slugs } } } } });
    }
    if (q.cluster?.length) and.push({ cluster: { slug: { in: q.cluster } } });
    if (q.season?.length) and.push({ seasons: { hasSome: q.season } });
    if (q.access?.length) and.push({ heavyAccess: { in: q.access } });
    if (q.airportKm) and.push({ airportKm: { lte: q.airportKm } });
    if (q.drone) and.push({ drone: 'ALLOWED' });
    if (q.q) {
      for (const word of q.q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)) {
        and.push({ searchText: { contains: word } });
      }
    }
    return { status: 'PUBLISHED', AND: and };
  }

  private orderBy(sort: CatalogueQuery['sort']): Prisma.LocationOrderByWithRelationInput[] {
    switch (sort) {
      case 'name':
        return [{ nameEn: 'asc' }];
      case 'airport':
        return [{ airportKm: { sort: 'asc', nulls: 'last' } }, { nameEn: 'asc' }];
      case 'elevation':
        return [{ elevationM: { sort: 'desc', nulls: 'last' } }, { nameEn: 'asc' }];
      case 'newest':
        return [{ publishedAt: { sort: 'desc', nulls: 'last' } }];
      // Recommended: a 360° view first, then the sharpest photo sets (MediaScoreService), then the editors' order
      default:
        return [{ hasPanorama: 'desc' }, { mediaScore: 'desc' }, { featured: 'desc' }, { sort: 'asc' }, { nameEn: 'asc' }];
    }
  }

  card(row: CardRow, lang: Lang) {
    const name = tr(row, 'name', lang);
    const reel = row.media[0]?.asset;
    const cover = this.media.image(row.cover, lang, name, 960) ?? this.media.image(reel, lang, name, 960);
    const terms = row.terms.map((t) => t.term);
    const labels = (kind: TermKind) => terms.filter((t) => t.kind === kind).map((t) => ({ slug: t.slug, label: tr(t, 'label', lang) }));
    return {
      id: row.id,
      slug: row.slug,
      name,
      summary: tr(row, 'summary', lang),
      region: trOpt(row, 'region', lang),
      cluster: row.cluster ? { slug: row.cluster.slug, name: tr(row.cluster, 'name', lang) } : null,
      lat: row.lat,
      lng: row.lng,
      elevationM: row.elevationM,
      airportCode: row.airportCode,
      airportKm: row.airportKm,
      driveHours: row.driveHours,
      heavyAccess: row.heavyAccess,
      seasons: row.seasons,
      genres: labels('GENRE'),
      landscapes: labels('LANDSCAPE'),
      cover,
      preview: this.media.video(reel, lang)?.preview ?? null,
      hasVideo: !!reel,
      hasPanorama: row.hasPanorama,
      featured: row.featured,
    };
  }

  async list(q: CatalogueQuery, lang: Lang) {
    const limit = q.limit ?? 24;
    const page = q.page ?? 1;
    const where = this.where(q);
    const [total, rows] = await Promise.all([
      this.prisma.location.count({ where }),
      this.prisma.location.findMany({
        where,
        include: CARD_INCLUDE,
        orderBy: this.orderBy(q.sort),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { items: rows.map((r) => this.card(r, lang)), total, page, pages: Math.max(1, Math.ceil(total / limit)) };
  }

  /** Every matching location as a light point for the map (clustering happens in the browser) */
  async mapPoints(q: CatalogueQuery, lang: Lang) {
    const rows = await this.prisma.location.findMany({
      where: this.where(q),
      select: {
        slug: true,
        nameEn: true,
        nameRu: true,
        summaryEn: true,
        summaryRu: true,
        regionEn: true,
        regionRu: true,
        lat: true,
        lng: true,
        featured: true,
        cluster: { select: { slug: true } },
        cover: { select: ASSET_PUBLIC_SELECT },
        terms: { where: { term: { kind: 'GENRE' } }, select: { term: true }, orderBy: { term: { sort: 'asc' } }, take: 3 },
      },
      orderBy: [{ featured: 'desc' }, { sort: 'asc' }],
    });
    return {
      points: rows.map((r) => ({
        slug: r.slug,
        name: tr(r, 'name', lang),
        summary: tr(r, 'summary', lang),
        region: trOpt(r, 'region', lang),
        lat: r.lat,
        lng: r.lng,
        featured: r.featured,
        cluster: r.cluster?.slug ?? null,
        thumb: this.media.thumb(r.cover, 480),
        genres: r.terms.map((t) => tr(t.term, 'label', lang)),
      })),
    };
  }

  /** Filter options with the number of published locations behind each */
  async taxonomy(lang: Lang) {
    const published = { location: { status: 'PUBLISHED' as const } };
    const [terms, clusters, seasonRows, accessRows] = await Promise.all([
      this.prisma.term.findMany({
        orderBy: [{ kind: 'asc' }, { sort: 'asc' }, { labelEn: 'asc' }],
        include: { _count: { select: { locations: { where: published } } } },
      }),
      this.prisma.cluster.findMany({
        orderBy: { sort: 'asc' },
        include: { _count: { select: { locations: { where: { status: 'PUBLISHED' } } } } },
      }),
      this.prisma.$queryRaw<{ season: string; n: bigint }[]>`
        SELECT s::text AS season, count(*) AS n FROM "Location", unnest(seasons) s
        WHERE status = 'PUBLISHED' GROUP BY s`,
      this.prisma.location.groupBy({ by: ['heavyAccess'], where: { status: 'PUBLISHED' }, _count: true }),
    ]);
    const group = (kind: TermKind) =>
      terms.filter((t) => t.kind === kind).map((t) => ({ slug: t.slug, label: tr(t, 'label', lang), count: t._count.locations }));
    return {
      genres: group('GENRE'),
      landscapes: group('LANDSCAPE'),
      eras: group('ERA'),
      tags: group('TAG'),
      clusters: clusters.map((c) => ({ slug: c.slug, name: tr(c, 'name', lang), tagline: tr(c, 'tagline', lang), count: c._count.locations })),
      seasons: ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'].map((s) => ({ value: s, count: Number(seasonRows.find((r) => r.season === s)?.n ?? 0) })),
      access: ['FULL', 'LIMITED', 'OFFROAD', 'NONE'].map((a) => ({ value: a, count: accessRows.find((r) => r.heavyAccess === a)?._count ?? 0 })),
    };
  }

  async detail(slug: string, lang: Lang) {
    const row = await this.prisma.location.findFirst({
      where: { slug, status: 'PUBLISHED' },
      include: {
        cluster: true,
        cover: { select: ASSET_PUBLIC_SELECT },
        og: { select: ASSET_PUBLIC_SELECT },
        terms: { include: { term: true }, orderBy: { term: { sort: 'asc' } } },
        media: { where: { asset: { state: 'READY' } }, orderBy: [{ sort: 'asc' }], include: { asset: { select: ASSET_PUBLIC_SELECT } } },
        panoramaEmbeds: { orderBy: { sort: 'asc' } },
      },
    });
    if (!row) throw notFound('Location');
    const name = tr(row, 'name', lang);
    const terms = row.terms.map((t) => t.term);
    const labels = (kind: TermKind) => terms.filter((t) => t.kind === kind).map((t) => ({ slug: t.slug, label: tr(t, 'label', lang) }));
    const label = (m: (typeof row.media)[number]) => trOpt(m, 'label', lang);

    const reels = row.media
      .filter((m) => m.role === 'SHOWREEL')
      .map((m) => {
        const v = this.media.video(m.asset, lang, name);
        return v && { ...v, label: label(m) };
      })
      .filter((v) => !!v);
    const broll = row.media
      .filter((m) => m.role === 'BROLL')
      .map((m) => {
        const v = this.media.video(m.asset, lang, name);
        return v && { ...v, label: label(m) ?? m.asset.title };
      })
      .filter((v) => !!v);
    const allPhotos = row.media
      .filter((m) => m.role === 'PHOTO')
      .map((m) => {
        const img = this.media.image(m.asset, lang, name, 1920);
        return img && { id: m.asset.id, ...img, timeOfDay: m.timeOfDay, label: label(m) };
      })
      .filter((v) => !!v);
    // The cover fills the page header, so the gallery does not show it a second time
    const coverId = row.cover && this.media.image(row.cover, lang, name) ? row.coverAssetId : (allPhotos[0]?.id ?? null);
    const photos = allPhotos.filter((p) => p.id !== coverId);
    const panoramas = row.media
      .filter((m) => m.role === 'PANORAMA')
      .map((m) => {
        const p = this.media.panorama(m.asset, lang, name);
        return p && { ...p, label: label(m) };
      })
      .filter((v) => !!v);

    const cover = this.media.image(row.cover, lang, name, 1920) ?? allPhotos[0] ?? reels[0]?.poster ?? null;
    const related = await this.related(row.id, row.clusterId, terms.filter((t) => t.kind === 'GENRE').map((t) => t.id), lang);
    const site = await this.settings.get('seo');

    return {
      id: row.id,
      slug: row.slug,
      name,
      summary: tr(row, 'summary', lang),
      description: tr(row, 'description', lang),
      region: trOpt(row, 'region', lang),
      cluster: row.cluster ? { slug: row.cluster.slug, name: tr(row.cluster, 'name', lang), tagline: tr(row.cluster, 'tagline', lang) } : null,
      genres: labels('GENRE'),
      landscapes: labels('LANDSCAPE'),
      eras: labels('ERA'),
      tags: labels('TAG'),
      cover,
      reels,
      broll,
      photos,
      panoramas,
      // Hosted 360° views (licensed embed codes): the site loads the player only after a click
      panoramaEmbeds: row.panoramaEmbeds.map((e) => ({ id: e.id, src: e.src, provider: embedProvider(e.src), label: trOpt(e, 'label', lang), credit: e.credit })),
      climate: this.climate.read(row),
      spec: {
        lat: row.lat,
        lng: row.lng,
        elevationM: row.elevationM,
        airport: row.airportCode || row.airportNameEn ? { code: row.airportCode, name: trOpt(row, 'airportName', lang), km: row.airportKm } : null,
        driveHours: row.driveHours,
        rail: row.railStationEn ? { name: tr(row, 'railStation', lang), km: row.railKm } : null,
        town: row.nearestTownEn ? { name: tr(row, 'nearestTown', lang), km: row.townKm } : null,
        heavyAccess: row.heavyAccess,
        accessNotes: trOpt(row, 'accessNotes', lang),
        connectivity: row.connectivity,
        power: row.power,
        hotels: trOpt(row, 'hotels', lang),
        hotelKm: row.hotelKm,
        nationalPark: row.nationalPark,
        borderZone: row.borderZone,
        drone: row.drone,
        permitNotes: trOpt(row, 'permitNotes', lang),
        seasons: row.seasons,
        climate: trOpt(row, 'climate', lang),
      },
      seo: {
        title: trOpt(row, 'seoTitle', lang) ?? name,
        description: trOpt(row, 'seoDescription', lang) ?? tr(row, 'summary', lang) ?? tr(site, 'description', lang),
        image: this.media.og(row.og) ?? this.media.og(row.cover) ?? (photos[0] ? { url: photos[0].src, width: photos[0].width, height: photos[0].height } : null),
      },
      related,
      updatedAt: row.updatedAt,
    };
  }

  /** Same cluster first, then shared genres */
  private async related(id: string, clusterId: string | null, genreIds: string[], lang: Lang) {
    const or: Prisma.LocationWhereInput[] = [];
    if (clusterId) or.push({ clusterId });
    if (genreIds.length) or.push({ terms: { some: { termId: { in: genreIds } } } });
    if (!or.length) return [];
    const rows = await this.prisma.location.findMany({
      where: { status: 'PUBLISHED', id: { not: id }, OR: or },
      include: CARD_INCLUDE,
      orderBy: [{ featured: 'desc' }, { sort: 'asc' }],
      take: 12,
    });
    rows.sort((a, b) => Number(b.clusterId === clusterId) - Number(a.clusterId === clusterId));
    return rows.slice(0, 4).map((r) => this.card(r, lang));
  }

  /** Request form multiselect */
  async options(lang: Lang) {
    const rows = await this.prisma.location.findMany({
      where: { status: 'PUBLISHED' },
      select: { slug: true, nameEn: true, nameRu: true, regionEn: true, regionRu: true, cluster: { select: { nameEn: true, nameRu: true } } },
    });
    const items = rows.map((r) => ({
      slug: r.slug,
      name: tr(r, 'name', lang),
      region: trOpt(r, 'region', lang),
      cluster: r.cluster ? tr(r.cluster, 'name', lang) : null,
    }));
    return { items: items.sort((a, b) => a.name.localeCompare(b.name, lang)) };
  }

  async home(lang: Lang) {
    const [reels, clusters, featured, tags, total, settings] = await Promise.all([
      this.prisma.heroReel.findMany({ where: { active: true }, orderBy: { sort: 'asc' }, include: { asset: { select: ASSET_PUBLIC_SELECT } } }),
      this.prisma.cluster.findMany({
        orderBy: { sort: 'asc' },
        include: { cover: { select: ASSET_PUBLIC_SELECT }, _count: { select: { locations: { where: { status: 'PUBLISHED' } } } } },
      }),
      this.prisma.location.findMany({ where: { status: 'PUBLISHED', featured: true }, include: CARD_INCLUDE, orderBy: { sort: 'asc' }, take: 8 }),
      this.prisma.term.findMany({ where: { kind: 'TAG' }, orderBy: { sort: 'asc' } }),
      this.prisma.location.count({ where: { status: 'PUBLISHED' } }),
      this.settings.all(),
    ]);
    const slugs = reels.map((r) => r.locationSlug).filter((s): s is string => !!s);
    const credited = slugs.length
      ? await this.prisma.location.findMany({ where: { slug: { in: slugs }, status: 'PUBLISHED' }, select: { slug: true, nameEn: true, nameRu: true, regionEn: true, regionRu: true } })
      : [];
    return {
      hero: reels.map((r) => {
        const loc = credited.find((l) => l.slug === r.locationSlug);
        return {
          key: r.key,
          label: tr(r, 'label', lang),
          genreSlug: r.genreSlug,
          video: this.media.video(r.asset, lang, tr(r, 'label', lang)),
          location: loc ? { slug: loc.slug, name: tr(loc, 'name', lang), region: trOpt(loc, 'region', lang) } : null,
        };
      }),
      clusters: clusters.map((c) => ({
        slug: c.slug,
        name: tr(c, 'name', lang),
        tagline: tr(c, 'tagline', lang),
        description: trOpt(c, 'description', lang),
        cover: this.media.image(c.cover, lang, tr(c, 'name', lang), 1600),
        count: c._count.locations,
        lat: c.lat,
        lng: c.lng,
        zoom: c.zoom,
      })),
      featured: featured.map((r) => this.card(r, lang)),
      tags: tags.map((t) => ({ slug: t.slug, label: tr(t, 'label', lang) })),
      highlights: settings.home.highlights.map((h) => ({ value: h.value, label: tr(h, 'label', lang) })),
      stats: { locations: total, clusters: clusters.length },
    };
  }
}
