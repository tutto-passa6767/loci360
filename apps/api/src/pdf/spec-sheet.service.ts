import { Injectable, Logger } from '@nestjs/common';
import type { Connectivity, DerivedMedia, DroneRule, HeavyAccess, PowerSupply, Prisma, Season, TimeOfDay } from '@loci/db';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { cfg } from '../config';
import { notFound } from '../common/errors';
import { Lang, tr, trOpt } from '../common/lang';
import { PrismaService } from '../common/prisma.service';
import { S3Service } from '../common/s3.service';
import { SettingsService } from '../common/settings.service';

const FONTS = join(__dirname, '..', 'assets', 'fonts');

// Brand palette: black, crimson red, white, steel grey
const CRIMSON = '#e61e32';
const GRAPHITE = '#0b0b0b';
const INK = '#1f2329';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';
const PALE = '#fdecee';

/** Geo-pin with a play button — the LOCI360 mark, drawn as vectors (24×32 box) */
const PIN = 'M12 32 C12 32 0 19.5 0 12 A12 12 0 1 1 24 12 C24 19.5 12 32 12 32 Z';
const PLAY = 'M9.5 7 L17.5 12 L9.5 17 Z';

/** Every page: A4 with these margins (addPage with options would otherwise fall back to Letter and 72 pt margins) */
const PAGE = { size: 'A4', margins: { top: 36, bottom: 48, left: 40, right: 40 } } as const;

/** A shortlist dossier holds at most this many locations */
export const SHORTLIST_MAX = 12;

type L = Record<Lang, string>;
const t = {
  title: { en: 'Location spec sheet', ru: 'Технический паспорт локации' },
  geo: { en: 'Geography & logistics', ru: 'География и логистика' },
  infra: { en: 'Infrastructure & restrictions', ru: 'Инфраструктура и ограничения' },
  gps: { en: 'GPS', ru: 'GPS' },
  elevation: { en: 'Elevation', ru: 'Высота' },
  airport: { en: 'Nearest airport', ru: 'Ближайший аэропорт' },
  drive: { en: 'Drive time', ru: 'Время в пути' },
  rail: { en: 'Railway station', ru: 'Ж/д станция' },
  town: { en: 'Nearest town', ru: 'Ближайший город' },
  access: { en: 'Heavy equipment', ru: 'Тяжёлая техника' },
  connectivity: { en: 'Mobile signal', ru: 'Мобильная связь' },
  power: { en: 'Power', ru: 'Электричество' },
  hotels: { en: 'Accommodation', ru: 'Проживание' },
  park: { en: 'National park', ru: 'Нацпарк' },
  border: { en: 'Border zone', ru: 'Погранзона' },
  drone: { en: 'Drones', ru: 'Дроны' },
  seasons: { en: 'Best seasons', ru: 'Сезоны' },
  genres: { en: 'Genres', ru: 'Жанры' },
  landscapes: { en: 'Landscape & architecture', ru: 'Ландшафт и архитектура' },
  about: { en: 'About the location', ru: 'О локации' },
  climate: { en: 'Climate', ru: 'Климат' },
  permits: { en: 'Permits', ru: 'Разрешения' },
  accessNotes: { en: 'Access notes', ru: 'Подъезд' },
  gallery: { en: 'Gallery', ru: 'Галерея' },
  request: { en: 'Request this location', ru: 'Запросить локацию' },
  requestText: {
    en: 'Scan the code to watch the 4K showreel and send a scouting request. Our location team replies within two business days.',
    ru: 'Отсканируйте код, чтобы посмотреть шоурил в 4K и отправить заявку на скаутинг. Команда локаций отвечает в течение двух рабочих дней.',
  },
  shortlist: { en: 'Location shortlist', ru: 'Подборка локаций' },
  shortlistText: {
    en: 'Spec sheets of the locations you picked, side by side and one per page. Distances, access and permits are indicative — the location team confirms them before the scout.',
    ru: 'Паспорта выбранных локаций: сравнение и по странице на каждую. Расстояния, подъезд и разрешения ориентировочные — команда локаций подтвердит их перед скаутингом.',
  },
  compare: { en: 'Side by side', ru: 'Сравнение' },
  location: { en: 'Location', ru: 'Локация' },
  zones: { en: 'Park / border', ru: 'Нацпарк / погранзона' },
  locationOf: { en: 'Location {i} of {n}', ru: 'Локация {i} из {n}' },
  online: { en: 'Showreel, photos, 360° and weather online', ru: 'Шоурил, фото, 360° и погода онлайн' },
  requestAll: { en: 'Request all {n} locations', ru: 'Запросить все локации ({n})' },
  requestAllText: {
    en: 'Scan the code to send one scouting request for the whole shortlist. Our location team replies within two business days.',
    ru: 'Отсканируйте код, чтобы отправить одну заявку на скаутинг по всей подборке. Команда локаций отвечает в течение двух рабочих дней.',
  },
  shareLink: { en: 'This shortlist online', ru: 'Подборка онлайн' },
  yes: { en: 'Yes', ru: 'Да' },
  no: { en: 'No', ru: 'Нет' },
  km: { en: 'km', ru: 'км' },
  m: { en: 'm', ru: 'м' },
  h: { en: 'h', ru: 'ч' },
  generated: { en: 'Generated', ru: 'Сформирован' },
  page: { en: 'Page', ru: 'Стр.' },
} satisfies Record<string, L>;

const ACCESS: Record<HeavyAccess, L> = {
  FULL: { en: 'Paved road — trucks and trailers', ru: 'Асфальт — грузовики и прицепы' },
  LIMITED: { en: 'Gravel or seasonal — trucks with care', ru: 'Грунт или сезонно — грузовики с осторожностью' },
  OFFROAD: { en: '4×4 only — equipment shuttled', ru: 'Только 4×4 — техника челноком' },
  NONE: { en: 'No vehicle access', ru: 'Без подъезда техники' },
};
const CONNECTIVITY: Record<Connectivity, L> = {
  NONE: { en: 'No signal', ru: 'Нет связи' },
  G2: { en: '2G', ru: '2G' },
  G3: { en: '3G', ru: '3G' },
  G4: { en: '4G / LTE', ru: '4G / LTE' },
  G5: { en: '5G', ru: '5G' },
};
const POWER: Record<PowerSupply, L> = {
  GRID: { en: 'Grid on site', ru: 'Сеть на площадке' },
  NEARBY: { en: 'Grid within a few km', ru: 'Сеть в нескольких км' },
  GENERATOR: { en: 'Generators only', ru: 'Только генераторы' },
};
const DRONE: Record<DroneRule, L> = {
  ALLOWED: { en: 'Standard registration', ru: 'Обычная регистрация' },
  PERMIT: { en: 'Special permit required', ru: 'Нужно спецразрешение' },
  RESTRICTED: { en: 'Restricted / no-fly zone', ru: 'Запретная зона' },
};
const SEASON: Record<Season, L> = {
  SPRING: { en: 'Spring', ru: 'Весна' },
  SUMMER: { en: 'Summer', ru: 'Лето' },
  AUTUMN: { en: 'Autumn', ru: 'Осень' },
  WINTER: { en: 'Winter', ru: 'Зима' },
};
const TIME: Record<TimeOfDay, L> = {
  DAY: { en: 'Day', ru: 'День' },
  GOLDEN_HOUR: { en: 'Golden hour', ru: 'Золотой час' },
  NIGHT: { en: 'Night', ru: 'Ночь' },
};

const INCLUDE = {
  cluster: true,
  cover: { select: { state: true, derived: true } },
  terms: { include: { term: true }, orderBy: { term: { sort: 'asc' } } },
  media: {
    where: { role: { in: ['PHOTO', 'SHOWREEL'] }, asset: { state: 'READY' } },
    orderBy: [{ role: 'asc' }, { sort: 'asc' }],
    include: { asset: { select: { state: true, derived: true } } },
  },
} satisfies Prisma.LocationInclude;
type Loc = Prisma.LocationGetPayload<{ include: typeof INCLUDE }>;
type Doc = InstanceType<typeof PDFDocument>;

/** Date in Kazakhstan (UTC+5), YYYY-MM-DD */
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Almaty' });

const coord = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(5)}° ${v >= 0 ? pos : neg}`;
const shortlistOf = (n: number, lang: Lang) => {
  if (lang === 'en') return `Shortlist: ${n} location${n === 1 ? '' : 's'}`;
  const d = n % 10;
  const word = n % 100 >= 11 && n % 100 <= 14 ? 'локаций' : d === 1 ? 'локация' : d >= 2 && d <= 4 ? 'локации' : 'локаций';
  return `Подборка: ${n} ${word}`;
};
const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
const jpeg = (d: unknown) => (d as DerivedMedia | null)?.jpeg?.key ?? null;

/**
 * Branded PDFs generated on request: the spec sheet of one location ("Download PDF Spec Sheet") and a shortlist
 * dossier — cover, a side-by-side comparison and one page per location.
 */
@Injectable()
export class SpecSheetService {
  private readonly log = new Logger('SpecSheet');
  /** Recently generated PDFs; keys include updatedAt, so an edit invalidates them */
  private cache = new Map<string, Buffer>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly settings: SettingsService,
  ) {}

  async render(slug: string, lang: Lang): Promise<{ pdf: Buffer; filename: string }> {
    const loc = await this.prisma.location.findFirst({ where: { slug, status: 'PUBLISHED' }, include: INCLUDE });
    if (!loc) throw notFound('Location');
    const filename = `LOCI360-${loc.slug}-${lang}.pdf`;
    const key = `${slug}:${lang}:${loc.updatedAt.getTime()}`;
    const hit = this.cache.get(key);
    if (hit) return { pdf: hit, filename };

    const contacts = await this.settings.get('contacts');
    const coverKey = this.coverKey(loc);
    const photos = loc.media.filter((m) => m.role === 'PHOTO' && jpeg(m.asset.derived) && jpeg(m.asset.derived) !== coverKey).slice(0, 4);
    const [cover, ...gallery] = await Promise.all([this.buffer(coverKey), ...photos.map((p) => this.buffer(jpeg(p.asset.derived)))]);

    const url = this.locationUrl(loc.slug, lang);
    const qr = await this.qr(url);

    const { doc, done, left, inner } = this.createDoc(`${tr(loc, 'name', lang)} — LOCI360`, t.title[lang]);
    const L = (x: L) => x[lang];

    this.header(doc, L(t.title));
    this.overview(doc, loc, lang, cover, 84);

    // ---------- page 2: story, notes, gallery, contact ----------
    doc.addPage();
    let y = doc.page.margins.top;
    const section = (title: string, body: string | null) => {
      if (!body) return;
      doc.font('bold').fontSize(9).fillColor(CRIMSON).text(title.toUpperCase(), left, y, { characterSpacing: 1 });
      doc.font('regular').fontSize(10).fillColor('#374151').text(body, left, doc.y + 5, { width: inner, lineGap: 2.5 });
      y = doc.y + 14;
    };
    section(L(t.about), tr(loc, 'description', lang) || null);
    section(L(t.climate), trOpt(loc, 'climate', lang));
    section(L(t.accessNotes), trOpt(loc, 'accessNotes', lang));
    section(L(t.permits), trOpt(loc, 'permitNotes', lang));

    const pics = gallery.map((buf, i) => ({ buf, media: photos[i] })).filter((p) => p.buf);
    if (pics.length) {
      const gw = (inner - 12) / 2;
      const gh = gw * 0.6;
      if (y + gh + 30 > doc.page.height - 200) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      doc.font('bold').fontSize(9).fillColor(CRIMSON).text(L(t.gallery).toUpperCase(), left, y, { characterSpacing: 1 });
      y = doc.y + 6;
      pics.forEach((p, i) => {
        const gx = left + (i % 2) * (gw + 12);
        const gy = y + Math.floor(i / 2) * (gh + 22);
        this.photo(doc, p.buf, gx, gy, gw, gh, 4);
        const cap = [p.media.timeOfDay ? L(TIME[p.media.timeOfDay]) : null, trOpt(p.media, 'label', lang)].filter(Boolean).join(' · ');
        if (cap) doc.font('regular').fontSize(8).fillColor(MUTED).text(cap, gx, gy + gh + 4, { width: gw });
      });
      y += Math.ceil(pics.length / 2) * (gh + 22) + 6;
    }

    if (y + 120 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    const contactLine = [tr(contacts, 'organisation', lang), contacts.email, contacts.phone].filter(Boolean).join('  ·  ');
    this.contactCard(doc, y, qr, L(t.request), L(t.requestText), contactLine, url);

    this.footers(doc, `LOCI360 · ${tr(loc, 'name', lang)} · ${L(t.generated)} ${today()}`, lang);
    doc.end();
    return { pdf: this.remember(key, await done), filename };
  }

  /** Shortlist dossier: unknown or unpublished slugs are skipped, the order is the visitor's */
  async renderShortlist(slugs: string[], lang: Lang): Promise<{ pdf: Buffer; filename: string }> {
    const wanted = [...new Set(slugs)].slice(0, SHORTLIST_MAX);
    const rows = await this.prisma.location.findMany({ where: { slug: { in: wanted }, status: 'PUBLISHED' }, include: INCLUDE });
    const locs = wanted.map((s) => rows.find((r) => r.slug === s)).filter((r): r is Loc => !!r);
    if (!locs.length) throw notFound('Location');
    const filename = `LOCI360-shortlist-${locs.length}-${lang}.pdf`;
    const key = `shortlist:${lang}:${locs.map((l) => `${l.slug}@${l.updatedAt.getTime()}`).join(',')}`;
    const hit = this.cache.get(key);
    if (hit) return { pdf: hit, filename };

    const L = (x: L) => x[lang];
    const n = this.number(lang);
    const list = locs.map((l) => l.slug).join(',');
    const prefix = `${cfg.appUrl}${lang === 'ru' ? '/ru' : ''}`;
    const requestUrl = `${prefix}/request?locations=${list}`;
    const shareUrl = `${prefix}/shortlist?l=${list}`;
    // The collage uses another photo of each place: its cover opens that place's own page further on
    const [contacts, qr, covers, tiles] = await Promise.all([
      this.settings.get('contacts'),
      this.qr(requestUrl),
      Promise.all(locs.map((l) => this.buffer(this.coverKey(l)))),
      Promise.all(locs.map((l) => this.buffer(this.tileKey(l)))),
    ]);

    const { doc, done, left, inner } = this.createDoc(`${L(t.shortlist)} — LOCI360`, L(t.shortlist));

    // ---------- cover: title, a numbered collage, one request for all ----------
    this.header(doc, L(t.shortlist));
    doc.font('bold').fontSize(26).fillColor(INK).text(shortlistOf(locs.length, lang), left, 84, { width: inner });
    doc.font('regular').fontSize(10).fillColor('#374151').text(L(t.shortlistText), left, doc.y + 6, { width: inner, lineGap: 2 });
    let y = doc.y + 18;
    const cols = locs.length <= 4 ? 2 : 3;
    const gap = 12;
    const tw = (inner - gap * (cols - 1)) / cols;
    const th = tw * (cols === 2 ? 0.58 : 0.6);
    const capH = cols === 2 ? 34 : 30;
    locs.forEach((loc, i) => {
      const x = left + (i % cols) * (tw + gap);
      const ty = y + Math.floor(i / cols) * (th + capH);
      this.photo(doc, tiles[i] ?? covers[i], x, ty, tw, th, 5);
      doc.circle(x + 14, ty + 14, 9).fill(CRIMSON);
      doc.font('bold').fontSize(9).fillColor('#ffffff').text(String(i + 1), x + 5, ty + 9.5, { width: 18, align: 'center', lineBreak: false });
      doc.font('semibold').fontSize(cols === 2 ? 9.5 : 8.5).fillColor(INK).text(tr(loc, 'name', lang), x, ty + th + 5, { width: tw, height: capH - 16, ellipsis: true });
      const sub = trOpt(loc, 'region', lang) ?? (loc.cluster ? tr(loc.cluster, 'name', lang) : '');
      if (sub) doc.font('regular').fontSize(7.5).fillColor(MUTED).text(sub, x, doc.y + 1, { width: tw, lineBreak: false, ellipsis: true });
    });
    y += Math.ceil(locs.length / cols) * (th + capH) + 8;
    if (y + 120 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    const contactLine = [tr(contacts, 'organisation', lang), contacts.email, contacts.phone].filter(Boolean).join('  ·  ');
    const single = locs.length === 1;
    this.contactCard(doc, y, qr, single ? L(t.request) : fill(L(t.requestAll), { n: locs.length }), single ? L(t.requestText) : L(t.requestAllText), contactLine, shareUrl);

    // ---------- comparison, landscape ----------
    doc.addPage({ ...PAGE, margins: { ...PAGE.margins }, layout: 'landscape' });
    const lw = doc.page.width - left * 2;
    const km = (v: number | null | undefined) => (v != null ? `${n(v)} ${L(t.km)}` : '—');
    const columns: { title: string; w: number; value: (l: Loc) => string }[] = [
      { title: '#', w: 0.025, value: () => '' },
      { title: L(t.location), w: 0.175, value: (l) => tr(l, 'name', lang) },
      { title: L(t.airport), w: 0.1, value: (l) => [l.airportCode, l.airportKm != null ? km(l.airportKm) : null].filter(Boolean).join(' · ') || '—' },
      { title: L(t.drive), w: 0.06, value: (l) => (l.driveHours != null ? `${n(l.driveHours)} ${L(t.h)}` : '—') },
      { title: L(t.elevation), w: 0.075, value: (l) => (l.elevationM != null ? `${n(l.elevationM)} ${L(t.m)}` : '—') },
      { title: L(t.access), w: 0.14, value: (l) => L(ACCESS[l.heavyAccess]) },
      { title: L(t.connectivity), w: 0.07, value: (l) => L(CONNECTIVITY[l.connectivity]) },
      { title: L(t.power), w: 0.09, value: (l) => L(POWER[l.power]) },
      { title: L(t.drone), w: 0.105, value: (l) => L(DRONE[l.drone]) },
      { title: L(t.zones), w: 0.075, value: (l) => `${l.nationalPark ? L(t.yes) : L(t.no)} / ${l.borderZone ? L(t.yes) : L(t.no)}` },
      { title: L(t.seasons), w: 0.085, value: (l) => l.seasons.map((s) => L(SEASON[s])).join(', ') || '—' },
    ];
    const heading = () => {
      this.header(doc, L(t.shortlist));
      doc.font('bold').fontSize(18).fillColor(INK).text(L(t.compare), left, 84, { width: lw });
      let x = left;
      const hy = doc.y + 10;
      let hh = 0;
      for (const c of columns) {
        doc.font('bold').fontSize(6.5).fillColor(CRIMSON).text(c.title.toUpperCase(), x + 3, hy, { width: c.w * lw - 6 });
        hh = Math.max(hh, doc.y - hy);
        x += c.w * lw;
      }
      const top = hy + hh + 10;
      doc.moveTo(left, top - 4).lineTo(left + lw, top - 4).lineWidth(0.8).strokeColor(INK).stroke();
      return top;
    };
    y = heading();
    locs.forEach((loc, i) => {
      doc.font('regular').fontSize(8);
      const heights = columns.map((c, ci) => (ci === 1 ? doc.font('semibold').heightOfString(c.value(loc), { width: c.w * lw - 6 }) + 10 : doc.font('regular').heightOfString(c.value(loc), { width: c.w * lw - 6 })));
      const rh = Math.max(...heights) + 12;
      if (y + rh > doc.page.height - doc.page.margins.bottom) {
        doc.addPage({ ...PAGE, margins: { ...PAGE.margins }, layout: 'landscape' });
        y = heading();
      }
      if (i % 2 === 0) doc.rect(left, y - 4, lw, rh).fill('#f7f7f8');
      let x = left;
      columns.forEach((c, ci) => {
        const w = c.w * lw - 6;
        if (ci === 0) {
          doc.circle(x + 9, y + 5, 7).fill(CRIMSON);
          doc.font('bold').fontSize(7.5).fillColor('#ffffff').text(String(i + 1), x + 2, y + 1.5, { width: 14, align: 'center', lineBreak: false });
        } else if (ci === 1) {
          doc.font('semibold').fontSize(8.5).fillColor(INK).text(c.value(loc), x + 3, y, { width: w, link: this.locationUrl(loc.slug, lang) });
          const sub = trOpt(loc, 'region', lang);
          if (sub) doc.font('regular').fontSize(7).fillColor(MUTED).text(sub, x + 3, doc.y + 1, { width: w });
        } else {
          doc.font('regular').fontSize(8).fillColor(INK).text(c.value(loc), x + 3, y, { width: w });
        }
        x += c.w * lw;
      });
      y += rh;
    });

    // ---------- one page per location ----------
    locs.forEach((loc, i) => {
      doc.addPage({ ...PAGE, margins: { ...PAGE.margins }, layout: 'portrait' });
      this.header(doc, fill(L(t.locationOf), { i: i + 1, n: locs.length }));
      const end = this.overview(doc, loc, lang, covers[i], 84);
      const url = this.locationUrl(loc.slug, lang);
      if (end + 30 < doc.page.height - doc.page.margins.bottom) {
        doc.font('semibold').fontSize(8.5).fillColor(INK).text(`${L(t.online)}:`, left, end, { continued: true });
        doc.font('regular').fillColor(CRIMSON).text(` ${url}`, { link: url });
      }
    });

    this.footers(doc, `LOCI360 · ${L(t.shortlist)} · ${L(t.generated)} ${today()}`, lang);
    doc.end();
    return { pdf: this.remember(key, await done), filename };
  }

  // ---------- building blocks ----------

  private createDoc(title: string, subject: string) {
    const doc = new PDFDocument({
      ...PAGE,
      margins: { ...PAGE.margins },
      bufferPages: true,
      info: { Title: title, Author: 'LOCI360', Subject: subject },
    });
    doc.registerFont('regular', join(FONTS, 'Inter-400.woff'));
    doc.registerFont('semibold', join(FONTS, 'Inter-600.woff'));
    doc.registerFont('bold', join(FONTS, 'Inter-700.woff'));
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
    const left = doc.page.margins.left;
    return { doc, done, left, inner: doc.page.width - left - doc.page.margins.right };
  }

  /** Graphite band with the mark, the document title and the date */
  private header(doc: Doc, title: string) {
    const W = doc.page.width;
    const left = doc.page.margins.left;
    const inner = W - left - doc.page.margins.right;
    doc.rect(0, 0, W, 64).fill(GRAPHITE);
    doc.save().translate(left, 16).scale(1).path(PIN).fill(CRIMSON).path(PLAY).fill('#ffffff').restore();
    doc.font('bold').fontSize(18).fillColor('#ffffff').text('LOCI360', left + 34, 22, { characterSpacing: 2 });
    doc
      .font('semibold')
      .fontSize(8)
      .fillColor('#9ca3af')
      .text(title.toUpperCase(), left, 22, { width: inner, align: 'right', characterSpacing: 1.2 })
      .text(today(), left, 34, { width: inner, align: 'right' });
  }

  /** Cover photo, name, summary, the two spec tables and genre chips; returns the y below them */
  private overview(doc: Doc, loc: Loc, lang: Lang, cover: Buffer | null, top: number): number {
    const left = doc.page.margins.left;
    const inner = doc.page.width - left - doc.page.margins.right;
    const L = (x: L) => x[lang];
    const n = this.number(lang);

    let y = top;
    const coverH = 250;
    if (cover) this.photo(doc, cover, left, y, inner, coverH, 6);
    else {
      // No photo yet: brand mark on a pale crimson field
      doc.roundedRect(left, y, inner, coverH, 6).fill(PALE);
      doc.save().translate(left + inner / 2 - 24, y + coverH / 2 - 32).scale(2).path(PIN).fill('#f6b8bf').path(PLAY).fill(PALE).restore();
    }
    y += coverH + 18;

    doc.font('bold').fontSize(24).fillColor(INK).text(tr(loc, 'name', lang), left, y, { width: inner });
    y = doc.y + 2;
    const sub = [trOpt(loc, 'region', lang), loc.cluster ? tr(loc.cluster, 'name', lang) : null].filter(Boolean).join('  ·  ');
    if (sub) {
      doc.font('semibold').fontSize(10).fillColor(CRIMSON).text(sub.toUpperCase(), left, y, { width: inner, characterSpacing: 0.8 });
      y = doc.y + 6;
    }
    doc.font('regular').fontSize(10.5).fillColor('#374151').text(tr(loc, 'summary', lang), left, y, { width: inner, lineGap: 2 });
    y = doc.y + 16;

    const km = (v: number | null | undefined) => (v != null ? `${n(v)} ${L(t.km)}` : '');
    const geoRows: [string, string][] = [
      [L(t.gps), `${coord(loc.lat, 'N', 'S')}, ${coord(loc.lng, 'E', 'W')}`],
      [L(t.elevation), loc.elevationM != null ? `${n(loc.elevationM)} ${L(t.m)}` : ''],
      [
        L(t.airport),
        [loc.airportCode, trOpt(loc, 'airportName', lang)].filter(Boolean).join(' — ') + (loc.airportKm != null ? ` · ${km(loc.airportKm)}` : ''),
      ],
      [L(t.drive), loc.driveHours != null ? `${n(loc.driveHours)} ${L(t.h)}` : ''],
      [L(t.rail), loc.railStationEn ? `${tr(loc, 'railStation', lang)}${loc.railKm != null ? ` · ${km(loc.railKm)}` : ''}` : ''],
      [L(t.town), loc.nearestTownEn ? `${tr(loc, 'nearestTown', lang)}${loc.townKm != null ? ` · ${km(loc.townKm)}` : ''}` : ''],
      [L(t.access), L(ACCESS[loc.heavyAccess])],
      [L(t.seasons), loc.seasons.map((s) => L(SEASON[s])).join(', ')],
    ];
    const infraRows: [string, string][] = [
      [L(t.connectivity), L(CONNECTIVITY[loc.connectivity])],
      [L(t.power), L(POWER[loc.power])],
      [L(t.hotels), [trOpt(loc, 'hotels', lang), loc.hotelKm != null ? km(loc.hotelKm) : null].filter(Boolean).join(' · ')],
      [L(t.park), loc.nationalPark ? L(t.yes) : L(t.no)],
      [L(t.border), loc.borderZone ? L(t.yes) : L(t.no)],
      [L(t.drone), L(DRONE[loc.drone])],
    ];

    const colW = (inner - 20) / 2;
    const table = (title: string, rows: [string, string][], x: number, ty: number) => {
      doc.font('bold').fontSize(9).fillColor(CRIMSON).text(title.toUpperCase(), x, ty, { width: colW, characterSpacing: 1 });
      ty = doc.y + 6;
      for (const [k, v] of rows.filter(([, v]) => v)) {
        doc.moveTo(x, ty).lineTo(x + colW, ty).lineWidth(0.5).strokeColor(LINE).stroke();
        ty += 5;
        doc.font('regular').fontSize(8.5).fillColor(MUTED).text(k, x, ty, { width: colW * 0.42 });
        const kh = doc.y;
        doc.font('semibold').fontSize(8.5).fillColor(INK).text(v, x + colW * 0.42, ty, { width: colW * 0.58 });
        ty = Math.max(kh, doc.y) + 5;
      }
      return ty;
    };
    const yl = table(L(t.geo), geoRows, left, y);
    const yr = table(L(t.infra), infraRows, left + colW + 20, y);
    y = Math.max(yl, yr) + 10;

    const chips = (title: string, labels: string[]) => {
      if (!labels.length) return;
      if (y > doc.page.height - 110) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      doc.font('bold').fontSize(9).fillColor(CRIMSON).text(title.toUpperCase(), left, y, { characterSpacing: 1 });
      y = doc.y + 5;
      let x = left;
      doc.font('semibold').fontSize(8.5);
      for (const label of labels) {
        const w = doc.widthOfString(label) + 16;
        if (x + w > left + inner) {
          x = left;
          y += 22;
        }
        doc.roundedRect(x, y, w, 17, 8.5).fill(PALE);
        doc.fillColor(CRIMSON).text(label, x + 8, y + 4.5, { lineBreak: false });
        x += w + 6;
      }
      y += 28;
    };
    const terms = loc.terms.map((x) => x.term);
    chips(L(t.genres), terms.filter((x) => x.kind === 'GENRE').map((x) => tr(x, 'label', lang)));
    chips(L(t.landscapes), terms.filter((x) => x.kind === 'LANDSCAPE').map((x) => tr(x, 'label', lang)));
    return y;
  }

  /** Graphite card: QR code, call to action, contacts and a link */
  private contactCard(doc: Doc, y: number, qr: Buffer, title: string, text: string, contactLine: string, url: string) {
    const left = doc.page.margins.left;
    const inner = doc.page.width - left - doc.page.margins.right;
    doc.roundedRect(left, y, inner, 112, 8).fill(GRAPHITE);
    doc.image(qr, left + 14, y + 14, { width: 84, height: 84 });
    const cx = left + 116;
    const cw = inner - 130;
    doc.font('bold').fontSize(13).fillColor('#ffffff').text(title, cx, y + 16, { width: cw });
    doc.font('regular').fontSize(8.5).fillColor('#c7cad1').text(text, cx, doc.y + 4, { width: cw, lineGap: 1.5 });
    doc.font('semibold').fontSize(8.5).fillColor('#ffffff').text(contactLine, cx, doc.y + 6, { width: cw });
    doc.font('regular').fontSize(8).fillColor('#ff8a95').text(url, cx, doc.y + 3, { width: cw, link: url });
  }

  private footers(doc: Doc, label: string, lang: Lang) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Text below the bottom margin would otherwise start a new page
      doc.page.margins.bottom = 0;
      const left = doc.page.margins.left;
      const inner = doc.page.width - left - doc.page.margins.right;
      const fy = doc.page.height - 30;
      doc.moveTo(left, fy - 6).lineTo(left + inner, fy - 6).lineWidth(0.5).strokeColor(LINE).stroke();
      doc
        .font('regular')
        .fontSize(7.5)
        .fillColor(MUTED)
        .text(label, left, fy, { width: inner, lineBreak: false })
        .text(`${t.page[lang]} ${i + 1} / ${range.count}`, left, fy, { width: inner, align: 'right', lineBreak: false });
    }
  }

  /** A photo cropped to the box; a grey box when the file is missing or unreadable */
  private photo(doc: Doc, buf: Buffer | null, x: number, y: number, w: number, h: number, radius: number) {
    doc.save().roundedRect(x, y, w, h, radius).clip();
    try {
      if (!buf) throw new Error('no image');
      doc.image(buf, x, y, { cover: [w, h], align: 'center', valign: 'center' });
    } catch (e) {
      if (buf) this.log.warn(`image skipped: ${(e as Error).message}`);
      doc.rect(x, y, w, h).fill(LINE);
    }
    doc.restore();
  }

  private coverKey(loc: Loc) {
    return jpeg(loc.cover?.derived) ?? loc.media.map((m) => jpeg(m.asset.derived)).find(Boolean) ?? null;
  }

  /** The first gallery photo that is not the cover, else the cover */
  private tileKey(loc: Loc) {
    const cover = this.coverKey(loc);
    return loc.media.filter((m) => m.role === 'PHOTO').map((m) => jpeg(m.asset.derived)).find((k) => k && k !== cover) ?? cover;
  }

  private buffer(key: string | null) {
    return key ? this.s3.getMediaBuffer(key) : Promise.resolve(null);
  }

  private locationUrl(slug: string, lang: Lang) {
    return `${cfg.appUrl}${lang === 'ru' ? '/ru' : ''}/locations/${slug}`;
  }

  private qr(url: string) {
    return QRCode.toBuffer(url, { type: 'png', margin: 1, width: 300, color: { dark: GRAPHITE, light: '#ffffff' } });
  }

  private number(lang: Lang) {
    return (v: number) => v.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 1 });
  }

  private remember(key: string, pdf: Buffer) {
    if (this.cache.size >= 30) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, pdf);
    return pdf;
  }
}
