import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@loci/db';
import { cfg } from '../config';
import { PrismaService } from './prisma.service';

export type Metric = 'visit' | 'view' | 'location' | 'pdf' | 'shortlistPdf' | 'request' | 'reel' | 'panorama' | 'shortlist' | 'ref' | 'device' | 'lang';

/** What the public site reports from the browser */
export interface CollectEvent {
  e: 'view' | 'reel' | 'panorama' | 'shortlist';
  /** path without query, e.g. /ru/locations/charyn-canyon */
  p: string;
  /** location slug for reel / panorama / shortlist */
  l?: string;
  /** first view after the page loaded — counts as a visit */
  v?: boolean;
  /** document.referrer of that first view */
  r?: string;
}

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|lighthouse|pingdom|uptime|monitor|python|curl|wget|httpclient|go-http|java\//i;
const LOCATION_PATH = /^\/locations\/([a-z0-9-]{1,80})$/;
const DAY = 86_400_000;

/** Kazakhstan calendar day (UTC+5) as YYYY-MM-DD */
export const kzDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Almaty' });
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

const device = (ua: string) => (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua) ? 'tablet' : /Mobi|iPhone|Android/i.test(ua) ? 'mobile' : 'desktop');

/**
 * Anonymous site statistics for the CMS: daily counters only — no cookies, no IP addresses, no visitor IDs, so they
 * need no consent. Hits are summed in memory and written every few seconds in one upsert.
 */
@Injectable()
export class StatsService implements OnModuleDestroy {
  private readonly log = new Logger('Stats');
  private pending = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private readonly ownHost = new URL(cfg.appUrl).host.replace(/^www\./, '');

  constructor(private readonly prisma: PrismaService) {}

  isBot(userAgent: string | undefined) {
    return !userAgent || BOT.test(userAgent);
  }

  hit(metric: Metric, key = '', n = 1) {
    const k = JSON.stringify([kzDay(), metric, key.slice(0, 200)]);
    this.pending.set(k, (this.pending.get(k) ?? 0) + n);
    this.timer ??= setTimeout(() => void this.flush(), 5000);
  }

  /** A browser event from the public site; crawlers and monitoring are ignored */
  collect(ev: CollectEvent, userAgent: string | undefined) {
    if (this.isBot(userAgent)) return;
    const ua = userAgent!;
    const lang = ev.p === '/ru' || ev.p.startsWith('/ru/') ? 'ru' : 'en';
    // EN and RU versions of a page count as one page
    const path = (lang === 'ru' ? ev.p.slice(3) : ev.p).replace(/\/+$/, '') || '/';

    if (ev.e !== 'view') {
      if (ev.l) this.hit(ev.e, ev.l);
      return;
    }
    this.hit('view', path);
    const loc = LOCATION_PATH.exec(path);
    if (loc) this.hit('location', loc[1]);
    if (ev.v) {
      this.hit('visit');
      this.hit('lang', lang);
      this.hit('device', device(ua));
      this.hit('ref', this.referrer(ev.r));
    }
  }

  /** Referrer host, or '' for direct visits and links inside the site */
  private referrer(r: string | undefined) {
    if (!r) return '';
    try {
      const host = new URL(r).host.replace(/^www\./, '').toLowerCase();
      return host === this.ownHost ? '' : host.slice(0, 120);
    } catch {
      return '';
    }
  }

  async flush() {
    this.timer = null;
    const rows = [...this.pending];
    this.pending.clear();
    if (!rows.length) return;
    const values = rows.map(([k, n]) => {
      const [day, metric, key] = JSON.parse(k) as [string, string, string];
      return Prisma.sql`(${day}::date, ${metric}, ${key}, ${n})`;
    });
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "StatDaily" ("day", "metric", "key", "count") VALUES ${Prisma.join(values)}
        ON CONFLICT ("day", "metric", "key") DO UPDATE SET "count" = "StatDaily"."count" + EXCLUDED."count"`;
    } catch (e) {
      this.log.warn(`could not save ${rows.length} counter(s): ${(e as Error).message}`);
    }
  }

  async onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
    await this.flush();
  }

  /** CMS report for the last `days` Kazakhstan days, with the period before it for comparison */
  async report(days: number) {
    await this.flush();
    const to = kzDay();
    const from = addDays(to, -(days - 1));
    const prevFrom = addDays(from, -days);
    const rows = await this.prisma.statDaily.findMany({ where: { day: { gte: new Date(`${prevFrom}T00:00:00Z`) } } });
    const dayOf = (d: Date) => d.toISOString().slice(0, 10);
    const current = rows.filter((r) => dayOf(r.day) >= from);
    const previous = rows.filter((r) => dayOf(r.day) < from);

    const total = (list: typeof rows, metric: Metric) => list.filter((r) => r.metric === metric).reduce((s, r) => s + r.count, 0);
    const METRICS: Metric[] = ['visit', 'view', 'location', 'pdf', 'shortlistPdf', 'request', 'reel', 'panorama', 'shortlist'];
    const totals = (list: typeof rows) => Object.fromEntries(METRICS.map((m) => [m, total(list, m)])) as Record<Metric, number>;
    const byKey = (metric: Metric) => {
      const map = new Map<string, number>();
      for (const r of current) if (r.metric === metric) map.set(r.key, (map.get(r.key) ?? 0) + r.count);
      return [...map].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
    };

    const series = Array.from({ length: days }, (_, i) => {
      const day = addDays(from, i);
      const list = current.filter((r) => dayOf(r.day) === day);
      return { day, visits: total(list, 'visit'), views: total(list, 'view'), requests: total(list, 'request') };
    });

    // Per location: views and actions from the counters, requests from the leads themselves
    const [locations, leadLinks] = await Promise.all([
      this.prisma.location.findMany({ select: { id: true, slug: true, nameEn: true, nameRu: true } }),
      this.prisma.leadLocation.findMany({
        where: { lead: { createdAt: { gte: new Date(Date.parse(`${from}T00:00:00+05:00`)) } } },
        select: { locationId: true },
      }),
    ]);
    const perLocation = new Map<string, Record<'views' | 'pdf' | 'reel' | 'panorama' | 'shortlist' | 'requests', number>>();
    const bump = (slug: string, field: 'views' | 'pdf' | 'reel' | 'panorama' | 'shortlist' | 'requests', n: number) => {
      const row = perLocation.get(slug) ?? { views: 0, pdf: 0, reel: 0, panorama: 0, shortlist: 0, requests: 0 };
      row[field] += n;
      perLocation.set(slug, row);
    };
    for (const r of current) {
      if (r.metric === 'location') bump(r.key, 'views', r.count);
      else if (r.metric === 'pdf' || r.metric === 'reel' || r.metric === 'panorama' || r.metric === 'shortlist') bump(r.key, r.metric, r.count);
    }
    for (const l of leadLinks) {
      const slug = locations.find((x) => x.id === l.locationId)?.slug;
      if (slug) bump(slug, 'requests', 1);
    }
    const topLocations = [...perLocation]
      .map(([slug, v]) => {
        const loc = locations.find((x) => x.slug === slug);
        return loc ? { slug, name: loc.nameRu || loc.nameEn, ...v } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.views - a.views || b.requests - a.requests)
      .slice(0, 15);

    return {
      from,
      to,
      days,
      totals: totals(current),
      previous: totals(previous),
      series,
      topLocations,
      pages: byKey('view').filter((p) => !LOCATION_PATH.test(p.key)).slice(0, 10),
      referrers: byKey('ref').slice(0, 10),
      devices: byKey('device'),
      langs: byKey('lang'),
    };
  }
}
