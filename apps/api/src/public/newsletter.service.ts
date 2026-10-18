import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { cfg } from '../config';
import { AuditService } from '../common/audit.service';
import { notFound } from '../common/errors';
import { Lang, tr } from '../common/lang';
import { MailService, mailHtml } from '../common/mail.service';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../common/settings.service';
import { SubscribeDto } from './catalogue.dto';

const T = {
  en: {
    subject: 'You are subscribed to LOCI360 production news',
    title: 'Welcome to LOCI360 production news',
    intro: 'New locations, permit changes and incentive updates for productions in Kazakhstan — a few letters a year, nothing else.',
    unsubscribe: 'Unsubscribe',
  },
  ru: {
    subject: 'Вы подписались на новости LOCI360 для продакшна',
    title: 'Добро пожаловать в новости LOCI360',
    intro: 'Новые локации, изменения в разрешениях и условиях поддержки съёмок в Казахстане — несколько писем в год, ничего лишнего.',
    unsubscribe: 'Отписаться',
  },
};

const csvCell = (v: unknown) => {
  const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/**
 * Newsletter sign-ups from the footer. Consent is given in the form; every letter carries a one-click unsubscribe
 * link. Answers never reveal whether an address was already on the list.
 */
@Injectable()
export class NewsletterService {
  private readonly log = new Logger('Newsletter');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async subscribe(dto: SubscribeDto, req: Request) {
    if (dto.website) return { ok: true };
    const existing = await this.prisma.subscriber.findUnique({ where: { email: dto.email } });
    if (existing && !existing.unsubscribedAt) return { ok: true };
    const data = { locale: dto.locale ?? 'en', token: randomBytes(24).toString('base64url'), sourcePath: dto.sourcePath?.slice(0, 300) ?? null, unsubscribedAt: null };
    const sub = existing
      ? await this.prisma.subscriber.update({ where: { id: existing.id }, data })
      : await this.prisma.subscriber.create({ data: { email: dto.email, ...data } });
    await this.audit.record({ action: 'newsletter.subscribed', targetType: 'subscriber', targetId: sub.id, req });
    void this.welcome(sub.id).catch((e) => this.log.error(`welcome ${sub.id}: ${(e as Error).message}`));
    return { ok: true };
  }

  async unsubscribe(token: string) {
    await this.prisma.subscriber.updateMany({ where: { token, unsubscribedAt: null }, data: { unsubscribedAt: new Date() } });
    return { ok: true };
  }

  private async welcome(id: string) {
    const sub = await this.prisma.subscriber.findUniqueOrThrow({ where: { id } });
    const lang: Lang = sub.locale === 'ru' ? 'ru' : 'en';
    const t = T[lang];
    const s = await this.settings.all();
    const link = `${cfg.appUrl}${lang === 'ru' ? '/ru' : ''}/unsubscribe?token=${sub.token}`;
    const org = tr(s.contacts, 'organisation', lang);
    await this.mail.send({
      to: sub.email,
      replyTo: s.contacts.email || undefined,
      subject: t.subject,
      text: `${t.intro}\n\n${org}\n${t.unsubscribe}: ${link}`,
      html: mailHtml(t.title, t.intro, [], `${org} · ${t.unsubscribe}: ${link}`),
      headers: { 'List-Unsubscribe': `<${link}>` },
    });
  }

  // ---------------------------------------------------------------- CMS

  async list(q: { search?: string; page?: number }) {
    const page = Math.max(1, q.page ?? 1);
    const where = q.search ? { email: { contains: q.search.toLowerCase() } } : {};
    const [items, total, active] = await Promise.all([
      this.prisma.subscriber.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 50,
        take: 50,
        select: { id: true, email: true, locale: true, sourcePath: true, createdAt: true, unsubscribedAt: true },
      }),
      this.prisma.subscriber.count({ where }),
      this.prisma.subscriber.count({ where: { unsubscribedAt: null } }),
    ]);
    return { items, total, active, page, pages: Math.max(1, Math.ceil(total / 50)) };
  }

  /** Active subscribers only — the list to send to */
  async exportCsv() {
    const rows = await this.prisma.subscriber.findMany({ where: { unsubscribedAt: null }, orderBy: { createdAt: 'asc' } });
    const header = ['email', 'language', 'subscribed_at', 'unsubscribe_link'];
    const lines = rows.map((r) =>
      [r.email, r.locale, r.createdAt, `${cfg.appUrl}${r.locale === 'ru' ? '/ru' : ''}/unsubscribe?token=${r.token}`].map(csvCell).join(','),
    );
    return '﻿' + [header.join(','), ...lines].join('\r\n');
  }

  async remove(id: string, actorId: string, req: Request) {
    const row = await this.prisma.subscriber.findUnique({ where: { id } });
    if (!row) throw notFound('Subscriber');
    await this.prisma.subscriber.delete({ where: { id } });
    await this.audit.record({ action: 'newsletter.deleted', actorId, targetType: 'subscriber', targetId: id, req });
    return { ok: true };
  }
}
