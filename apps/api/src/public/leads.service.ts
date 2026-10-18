import { Injectable, Logger } from '@nestjs/common';
import type { BudgetRange, ProjectType } from '@loci/db';
import type { Request } from 'express';
import { cfg } from '../config';
import { AuditService } from '../common/audit.service';
import { AppError } from '../common/errors';
import { Lang, tr } from '../common/lang';
import { MailService, mailHtml } from '../common/mail.service';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../common/settings.service';
import { StatsService } from '../common/stats.service';
import { CreateLeadDto, CreateQuestionDto } from './catalogue.dto';

export const PROJECT_TYPES: Record<ProjectType, { en: string; ru: string }> = {
  FEATURE: { en: 'Feature film', ru: 'Полнометражный фильм' },
  SERIES: { en: 'Series', ru: 'Сериал' },
  COMMERCIAL: { en: 'Commercial', ru: 'Реклама' },
  MUSIC_VIDEO: { en: 'Music video', ru: 'Музыкальный клип' },
  DOCUMENTARY: { en: 'Documentary', ru: 'Документальный фильм' },
  OTHER: { en: 'Other', ru: 'Другое' },
};

export const BUDGETS: Record<BudgetRange, { en: string; ru: string }> = {
  UNDER_500K: { en: 'Under $500K', ru: 'До $500 тыс.' },
  FROM_500K_TO_2M: { en: '$500K – $2M', ru: '$500 тыс. – $2 млн' },
  FROM_2M_TO_10M: { en: '$2M – $10M', ru: '$2 млн – $10 млн' },
  OVER_10M: { en: 'Over $10M', ru: 'Более $10 млн' },
  UNDISCLOSED: { en: 'Prefer not to say', ru: 'Не указан' },
};

const fmtDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');

const T = {
  en: {
    subject: (n: number) => `We received your scouting request #${n} — LOCI360`,
    title: 'Thank you — your request is with our location team',
    intro: (name: string) =>
      `Hello ${name},\n\nWe have received your scouting request. A location manager will get back to you within two business days with availability, permits and next steps.`,
    project: 'Project type',
    budget: 'Budget',
    dates: 'Shoot dates',
    locations: 'Locations',
    message: 'Message',
    footer: (org: string, email: string) => `${org}\nReply to this email or write to ${email}.`,
  },
  ru: {
    subject: (n: number) => `Мы получили вашу заявку на скаутинг №${n} — LOCI360`,
    title: 'Спасибо — заявка передана команде локаций',
    intro: (name: string) =>
      `Здравствуйте, ${name}!\n\nМы получили вашу заявку на скаутинг. Менеджер по локациям ответит в течение двух рабочих дней: доступность, разрешения и следующие шаги.`,
    project: 'Тип проекта',
    budget: 'Бюджет',
    dates: 'Даты съёмок',
    locations: 'Локации',
    message: 'Сообщение',
    footer: (org: string, email: string) => `${org}\nОтветьте на это письмо или напишите на ${email}.`,
  },
};

const Q = {
  en: {
    subject: (n: number) => `We received your question #${n} — LOCI360`,
    title: 'Thank you — your question is with our location manager',
    intro: (name: string) => `Hello ${name},\n\nWe have received your question. A location manager will reply within two business days.`,
    question: 'Your question',
  },
  ru: {
    subject: (n: number) => `Мы получили ваш вопрос №${n} — LOCI360`,
    title: 'Спасибо — вопрос передан менеджеру по локациям',
    intro: (name: string) => `Здравствуйте, ${name}!\n\nМы получили ваш вопрос. Менеджер по локациям ответит в течение двух рабочих дней.`,
    question: 'Ваш вопрос',
  },
};

/** Scouting requests from the public form (CRM-lite lives in the CMS) */
@Injectable()
export class LeadsService {
  private readonly log = new Logger('Leads');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly stats: StatsService,
  ) {}

  async create(dto: CreateLeadDto, req: Request) {
    // Bots fill every field, people never see this one: pretend success and store nothing
    if (dto.website) return { ok: true, number: 0 };

    const shootFrom = dto.shootFrom ? new Date(dto.shootFrom) : null;
    const shootTo = dto.shootTo ? new Date(dto.shootTo) : null;
    if (shootFrom && shootTo && shootTo < shootFrom) throw new AppError(400, 'INVALID_DATES', 'Shoot end date is before the start date');

    const locations = dto.locations?.length
      ? await this.prisma.location.findMany({
          where: { slug: { in: dto.locations }, status: 'PUBLISHED' },
          select: { id: true, slug: true, nameEn: true, nameRu: true },
        })
      : [];

    const lead = await this.prisma.lead.create({
      data: {
        name: dto.name,
        email: dto.email,
        company: dto.company,
        country: dto.country,
        phone: dto.phone || null,
        projectType: dto.projectType,
        budget: dto.budget,
        shootFrom,
        shootTo,
        message: dto.message || null,
        locale: dto.locale ?? 'en',
        sourcePath: dto.sourcePath?.slice(0, 300),
        ip: req.ip,
        userAgent: req.headers['user-agent']?.slice(0, 400),
        locations: { create: locations.map((l) => ({ locationId: l.id })) },
      },
    });
    await this.audit.record({ action: 'lead.created', targetType: 'lead', targetId: lead.id, req, meta: { number: lead.number, locations: locations.length } });

    // Mail must not fail the request: the lead is already saved and visible in the CMS
    void this.notify(lead.id).catch((e) => this.log.error(`notify #${lead.number}: ${(e as Error).message}`));
    this.stats.hit('request');
    return { ok: true, number: lead.number };
  }

  /** A short question to the location manager: lands in the same CMS inbox, marked as a question */
  async ask(dto: CreateQuestionDto, req: Request) {
    if (dto.website) return { ok: true, number: 0 };
    const lead = await this.prisma.lead.create({
      data: {
        kind: 'QUESTION',
        name: dto.name,
        email: dto.email,
        company: '',
        country: '',
        projectType: 'OTHER',
        budget: 'UNDISCLOSED',
        message: dto.message,
        locale: dto.locale ?? 'en',
        sourcePath: dto.sourcePath?.slice(0, 300),
        ip: req.ip,
        userAgent: req.headers['user-agent']?.slice(0, 400),
      },
    });
    await this.audit.record({ action: 'lead.question', targetType: 'lead', targetId: lead.id, req, meta: { number: lead.number } });
    void this.notifyQuestion(lead.id).catch((e) => this.log.error(`notify question #${lead.number}: ${(e as Error).message}`));
    this.stats.hit('request', 'question');
    return { ok: true, number: lead.number };
  }

  private async notifyQuestion(leadId: string) {
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    const s = await this.settings.all();
    if (s.leads.notifyEmails.length) {
      const rows: [string, string][] = [
        ['Name', lead.name],
        ['Email', lead.email],
        ['Question', lead.message ?? ''],
        ['Language', lead.locale.toUpperCase()],
        ['Sent from', lead.sourcePath ? `${cfg.appUrl}${lead.sourcePath}` : ''],
      ];
      await this.mail.send({
        to: s.leads.notifyEmails,
        replyTo: lead.email,
        subject: `New question #${lead.number} — ${lead.name}`,
        text: rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nOpen in CMS: ${cfg.appUrl}/admin/leads/${lead.id}`,
        html: mailHtml(`Question #${lead.number}`, `${lead.name} asked the location manager.`, rows, `Open in CMS: ${cfg.appUrl}/admin/leads/${lead.id}`),
      });
    }
    if (s.leads.autoReply) {
      const lang: Lang = lead.locale === 'ru' ? 'ru' : 'en';
      const t = Q[lang];
      const org = tr(s.contacts, 'organisation', lang);
      await this.mail.send({
        to: lead.email,
        replyTo: s.contacts.email || undefined,
        subject: t.subject(lead.number),
        text: `${t.intro(lead.name)}\n\n${t.question}: ${lead.message ?? ''}\n\n${T[lang].footer(org, s.contacts.email)}`,
        html: mailHtml(t.title, t.intro(lead.name), [[t.question, lead.message ?? '']], T[lang].footer(org, s.contacts.email)),
      });
    }
  }

  private async notify(leadId: string) {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
      include: { locations: { include: { location: { select: { slug: true, nameEn: true, nameRu: true } } } } },
    });
    const s = await this.settings.all();
    const dates = [fmtDate(lead.shootFrom), fmtDate(lead.shootTo)].filter(Boolean).join(' → ');

    // 1. Location team
    if (s.leads.notifyEmails.length) {
      const names = lead.locations.map((l) => `${l.location.nameEn} — ${cfg.appUrl}/locations/${l.location.slug}`).join('\n');
      const rows: [string, string][] = [
        ['Name', lead.name],
        ['Company', lead.company],
        ['Country', lead.country],
        ['Email', lead.email],
        ['Phone', lead.phone ?? ''],
        ['Project type', PROJECT_TYPES[lead.projectType].en],
        ['Budget', BUDGETS[lead.budget].en],
        ['Shoot dates', dates],
        ['Locations', names],
        ['Message', lead.message ?? ''],
        ['Language', lead.locale.toUpperCase()],
        ['Sent from', lead.sourcePath ? `${cfg.appUrl}${lead.sourcePath}` : ''],
      ];
      await this.mail.send({
        to: s.leads.notifyEmails,
        replyTo: lead.email,
        subject: `New scouting request #${lead.number} — ${lead.company} (${lead.country})`,
        text: rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nOpen in CMS: ${cfg.appUrl}/admin/leads/${lead.id}`,
        html: mailHtml(`Scouting request #${lead.number}`, `${lead.name} from ${lead.company} sent a request.`, rows, `Open in CMS: ${cfg.appUrl}/admin/leads/${lead.id}`),
      });
    }

    // 2. Confirmation to the producer, in the language they used
    if (s.leads.autoReply) {
      const lang: Lang = lead.locale === 'ru' ? 'ru' : 'en';
      const t = T[lang];
      const rows: [string, string][] = [
        [t.project, PROJECT_TYPES[lead.projectType][lang]],
        [t.budget, BUDGETS[lead.budget][lang]],
        [t.dates, dates],
        [t.locations, lead.locations.map((l) => tr(l.location, 'name', lang)).join(', ')],
        [t.message, lead.message ?? ''],
      ];
      const org = tr(s.contacts, 'organisation', lang);
      await this.mail.send({
        to: lead.email,
        replyTo: s.contacts.email || undefined,
        subject: t.subject(lead.number),
        text: `${t.intro(lead.name)}\n\n${rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${t.footer(org, s.contacts.email)}`,
        html: mailHtml(t.title, t.intro(lead.name), rows, t.footer(org, s.contacts.email)),
      });
    }
  }
}
