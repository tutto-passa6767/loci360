import { Injectable } from '@nestjs/common';
import type { ServiceCategory } from '@loci/db';
import { notFound } from '../common/errors';
import { Lang, tr, trOpt } from '../common/lang';
import { ASSET_PUBLIC_SELECT, MediaPresenter } from '../common/media.presenter';
import { PrismaService } from '../common/prisma.service';
import { GA4_ID, METRIKA_ID, SettingsService } from '../common/settings.service';

/** Editorial pages, the service-company registry and site-wide settings */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaPresenter,
    private readonly settings: SettingsService,
  ) {}

  async page(slug: string, lang: Lang) {
    const p = await this.prisma.page.findFirst({ where: { slug, published: true }, include: { og: { select: ASSET_PUBLIC_SELECT } } });
    if (!p) throw notFound('Page');
    const title = tr(p, 'title', lang);
    return {
      slug: p.slug,
      title,
      lead: tr(p, 'lead', lang),
      /** Markdown */
      body: tr(p, 'body', lang),
      seo: {
        title: trOpt(p, 'seoTitle', lang) ?? title,
        description: trOpt(p, 'seoDescription', lang) ?? (tr(p, 'lead', lang) || null),
        image: this.media.og(p.og),
      },
      updatedAt: p.updatedAt,
    };
  }

  async services(lang: Lang, category?: ServiceCategory) {
    const rows = await this.prisma.serviceCompany.findMany({
      where: { published: true, ...(category ? { category } : {}) },
      orderBy: [{ category: 'asc' }, { sort: 'asc' }, { name: 'asc' }],
      include: { logo: { select: ASSET_PUBLIC_SELECT } },
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        city: tr(r, 'city', lang),
        description: tr(r, 'description', lang),
        website: r.website,
        email: r.email,
        phone: r.phone,
        logo: this.media.thumb(r.logo, 240),
      })),
    };
  }

  async site(lang: Lang) {
    const s = await this.settings.all();
    const [ogAsset, photo] = await Promise.all(
      [s.seo.ogAssetId, s.manager.photoAssetId].map((id) => (id ? this.prisma.asset.findUnique({ where: { id }, select: ASSET_PUBLIC_SELECT }) : null)),
    );
    const managerName = tr(s.manager, 'name', lang);
    const pick = <T extends Record<string, unknown>>(row: T, field: string) => tr(row as never, field, lang);
    return {
      // Without a name the card shows the office instead of a person
      manager: {
        name: managerName || null,
        role: managerName ? tr(s.manager, 'role', lang) || null : null,
        photo: managerName ? this.media.image(photo, lang, managerName, 400) : null,
        phone: s.manager.phone || s.contacts.phone || null,
        whatsapp: s.manager.whatsapp || null,
        telegram: s.manager.telegram || null,
        email: s.contacts.email || null,
      },
      process: s.process.steps
        .map((x) => ({ title: pick(x, 'title'), text: pick(x, 'text'), duration: pick(x, 'duration') }))
        .filter((x) => x.title),
      faq: s.faq.items.map((x) => ({ q: pick(x, 'q'), a: pick(x, 'a') })).filter((x) => x.q && x.a),

      contacts: {
        organisation: tr(s.contacts, 'organisation', lang),
        email: s.contacts.email,
        phone: s.contacts.phone,
        address: tr(s.contacts, 'address', lang),
        website: s.contacts.website,
      },
      social: s.social,
      seo: { title: tr(s.seo, 'title', lang), description: tr(s.seo, 'description', lang), image: this.media.og(ogAsset) },
      // Re-checked here as well: these IDs end up in script URLs on every page
      analytics: {
        ga4Id: GA4_ID.test(s.analytics.ga4Id) ? s.analytics.ga4Id : null,
        metrikaId: METRIKA_ID.test(s.analytics.metrikaId) ? s.analytics.metrikaId : null,
      },
    };
  }

  /** Everything public for sitemap.xml */
  async sitemap() {
    const [locations, pages, clusters] = await Promise.all([
      this.prisma.location.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true }, orderBy: { slug: 'asc' } }),
      this.prisma.page.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
      this.prisma.cluster.findMany({ select: { slug: true, updatedAt: true } }),
    ]);
    return { locations, pages, clusters };
  }
}
