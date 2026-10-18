import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Site-wide settings the team edits in the CMS. Each top-level key is one Setting row. */
export interface SiteSettings {
  contacts: {
    organisationEn: string;
    organisationRu: string;
    email: string;
    phone: string;
    addressEn: string;
    addressRu: string;
    website: string;
  };
  leads: {
    /** Who receives new scouting requests */
    notifyEmails: string[];
    /** Send the requester a confirmation email */
    autoReply: boolean;
  };
  seo: {
    titleEn: string;
    titleRu: string;
    descriptionEn: string;
    descriptionRu: string;
    /** Default Open Graph image */
    ogAssetId: string | null;
  };
  social: {
    instagram: string;
    youtube: string;
    vimeo: string;
    linkedin: string;
  };
  home: {
    /** Key figures in the "Why film in Kazakhstan" block */
    highlights: { value: string; labelEn: string; labelRu: string }[];
  };
  /** Third-party analytics; they load only after the visitor accepts analytics cookies. Empty = off, no banner */
  analytics: {
    /** Google Analytics 4 measurement ID, G-XXXXXXXXXX */
    ga4Id: string;
    /** Yandex Metrica counter number */
    metrikaId: string;
  };
  /** The person producers talk to: card on the home page, request page and footer. Without a name the office is shown */
  manager: {
    nameEn: string;
    nameRu: string;
    roleEn: string;
    roleRu: string;
    photoAssetId: string | null;
    phone: string;
    /** WhatsApp number, digits with country code */
    whatsapp: string;
    /** Telegram username without @ */
    telegram: string;
  };
  /** "How it works": steps from the first request to the rebate, with typical durations */
  process: {
    steps: { titleEn: string; titleRu: string; textEn: string; textRu: string; durationEn: string; durationRu: string }[];
  };
  /** Questions producers ask, on the home page (and as FAQPage structured data) */
  faq: {
    items: { qEn: string; qRu: string; aEn: string; aRu: string }[];
  };
}

export type SettingKey = keyof SiteSettings;

export const DEFAULT_SETTINGS: SiteSettings = {
  contacts: {
    organisationEn: 'LOCI360 Location Office',
    organisationRu: 'Офис локаций LOCI360',
    email: 'scouting@loci360.kz',
    phone: '',
    addressEn: 'Almaty, Kazakhstan',
    addressRu: 'Алматы, Казахстан',
    website: 'https://loci360.kz',
  },
  leads: { notifyEmails: ['scouting@loci360.kz'], autoReply: true },
  seo: {
    titleEn: 'LOCI360 — Film locations in Kazakhstan',
    titleRu: 'LOCI360 — локации для съёмок в Казахстане',
    descriptionEn:
      'Scout canyons, deserts, alpine lakes and futuristic cityscapes of Kazakhstan. 4K showreels, technical spec sheets and a direct line to local production support.',
    descriptionRu:
      'Каньоны, пустыни, горные озёра и футуристичные города Казахстана. Шоурилы в 4K, технические паспорта локаций и прямая связь с местной поддержкой производства.',
    ogAssetId: null,
  },
  social: { instagram: '', youtube: '', vimeo: '', linkedin: '' },
  home: { highlights: [] },
  analytics: { ga4Id: '', metrikaId: '' },
  manager: { nameEn: '', nameRu: '', roleEn: 'Location manager', roleRu: 'Менеджер по локациям', photoAssetId: null, phone: '', whatsapp: '', telegram: '' },
  process: {
    steps: [
      {
        titleEn: 'Brief',
        titleRu: 'Бриф',
        textEn: 'Send the format, dates and the look you are after. A location manager replies within two business days.',
        textRu: 'Пришлите формат, даты и нужную картинку. Менеджер по локациям ответит в течение двух рабочих дней.',
        durationEn: '1–2 days',
        durationRu: '1–2 дня',
      },
      {
        titleEn: 'Shortlist',
        titleRu: 'Подборка',
        textEn: 'We match places to the script and send spec sheets, reels and 360° views — with access, power, drone and permit notes for each.',
        textRu: 'Подбираем места под сценарий и присылаем паспорта, ролики и 360°-обзоры — с подъездом, электричеством, дронами и разрешениями по каждому.',
        durationEn: '3–5 days',
        durationRu: '3–5 дней',
      },
      {
        titleEn: 'Scout',
        titleRu: 'Скаутинг',
        textEn: 'A virtual recce first, then the trip with a local fixer: light, angles, base camp, roads and weather windows.',
        textRu: 'Сначала виртуальный осмотр, потом выезд с местным фиксером: свет, ракурсы, базовый лагерь, дороги и погодные окна.',
        durationEn: '1–2 weeks',
        durationRu: '1–2 недели',
      },
      {
        titleEn: 'Permits',
        titleRu: 'Разрешения',
        textEn: 'National parks, border zones, drones and heritage sites: we say early what a place needs, prepare the applications with you and follow them up.',
        textRu: 'Нацпарки, погранзоны, дроны и памятники: заранее говорим, что нужно для места, готовим заявки вместе с вами и ведём их.',
        durationEn: 'Typically 2–6 weeks',
        durationRu: 'Обычно 2–6 недель',
      },
      {
        titleEn: 'Shoot',
        titleRu: 'Съёмки',
        textEn: 'Crew, equipment, transport and accommodation through local service companies; the location office stays on call.',
        textRu: 'Группа, техника, транспорт и проживание через местные сервисные компании; офис локаций на связи.',
        durationEn: 'Your schedule',
        durationRu: 'По вашему графику',
      },
      {
        titleEn: 'Rebate',
        titleRu: 'Возврат затрат',
        textEn: 'Keep the paperwork for the local-spend rebate and we help assemble the report. Current terms are confirmed on request.',
        textRu: 'Сохраните документы по расходам в Казахстане — поможем собрать отчёт на возврат. Актуальные условия подтверждаем по запросу.',
        durationEn: 'After wrap',
        durationRu: 'После съёмок',
      },
    ],
  },
  faq: {
    items: [
      {
        qEn: 'How fast do you reply?',
        qRu: 'Как быстро вы отвечаете?',
        aEn: 'A location manager answers every request within two business days — with availability, the permits a place needs and the next steps.',
        aRu: 'Менеджер по локациям отвечает на каждую заявку в течение двух рабочих дней: доступность, нужные разрешения и следующие шаги.',
      },
      {
        qEn: 'Do you help with permits?',
        qRu: 'Вы помогаете с разрешениями?',
        aEn: 'Yes. Each spec sheet shows whether a place is in a national park or a border zone and what the drone rules are. We prepare the applications with you and follow them up; see also the Permits page.',
        aRu: 'Да. В паспорте каждой локации видно, нацпарк это или погранзона и какие правила для дронов. Заявки готовим вместе с вами и ведём их; подробнее — на странице «Разрешения».',
      },
      {
        qEn: 'Can we fly drones?',
        qRu: 'Можно ли снимать с дронов?',
        aEn: 'Drones are registered in Kazakhstan before the shoot; some places need a special permit and a few are no-fly zones. The drone rule is on every location page.',
        aRu: 'Дроны регистрируются в Казахстане до съёмок; в некоторых местах нужно спецразрешение, а часть территорий закрыта для полётов. Правило для дронов указано на странице каждой локации.',
      },
      {
        qEn: 'Is there a cash rebate?',
        qRu: 'Есть ли возврат затрат?',
        aEn: 'Kazakhstan has offered foreign productions a rebate on local spend. Current terms are confirmed on request — see the Cash rebate page and ask your manager.',
        aRu: 'Казахстан предлагал иностранным проектам возврат части затрат в стране. Актуальные условия подтверждаем по запросу — смотрите страницу «Кэшбэк» и спросите менеджера.',
      },
      {
        qEn: 'Can we hire local crew and equipment?',
        qRu: 'Можно ли нанять местную группу и технику?',
        aEn: 'Yes. The Services directory lists production service companies, equipment rental, transport and catering, and we can introduce you.',
        aRu: 'Да. В разделе «Сервисы» собраны продакшн-компании, прокат техники, транспорт и кейтеринг; можем познакомить.',
      },
      {
        qEn: 'When is the best time to shoot?',
        qRu: 'Когда лучше снимать?',
        aEn: 'It depends on the place: every location page shows its best seasons, weather by month and a light planner for golden and blue hour on any date.',
        aRu: 'Зависит от места: на странице каждой локации есть лучшие сезоны, погода по месяцам и планировщик света с золотым и синим часом на любую дату.',
      },
      {
        qEn: 'What about entry for a foreign crew?',
        qRu: 'Как с въездом для иностранной группы?',
        aEn: 'Entry rules depend on citizenship and the purpose of the trip. Send us the crew list and we will advise on the current requirements.',
        aRu: 'Правила въезда зависят от гражданства и цели поездки. Пришлите список группы — подскажем актуальные требования.',
      },
    ],
  },
};

export const GA4_ID = /^G-[A-Z0-9]{4,15}$/;
export const METRIKA_ID = /^\d{5,12}$/;

const KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

/** Settings with a 30-second in-process cache */
@Injectable()
export class SettingsService {
  private cache: { at: number; values: SiteSettings } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async all(): Promise<SiteSettings> {
    if (this.cache && Date.now() - this.cache.at < 30_000) return this.cache.values;
    const rows = await this.prisma.setting.findMany({ where: { key: { in: KEYS } } });
    const values = structuredClone(DEFAULT_SETTINGS) as SiteSettings;
    for (const row of rows) {
      const key = row.key as SettingKey;
      // Stored values are merged over defaults so new fields get a sensible value
      (values as any)[key] = { ...(DEFAULT_SETTINGS[key] as object), ...(row.value as object) };
    }
    this.cache = { at: Date.now(), values };
    return values;
  }

  async get<K extends SettingKey>(key: K): Promise<SiteSettings[K]> {
    return (await this.all())[key];
  }

  async set<K extends SettingKey>(key: K, value: SiteSettings[K]) {
    await this.prisma.setting.upsert({
      where: { key },
      update: { value: value as any },
      create: { key, value: value as any },
    });
    this.cache = null;
  }

  static isKey(key: string): key is SettingKey {
    return (KEYS as string[]).includes(key);
  }
}
