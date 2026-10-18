import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { cfg } from '../config';

export interface MailMessage {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Minimal branded HTML wrapper: black bar with a crimson rule, graphite text, plain table of fields */
export function mailHtml(title: string, intro: string, rows: [string, string][], footer = ''): string {
  const body = rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td>` +
        `<td style="padding:6px 0;color:#111827">${escapeHtml(v).replace(/\n/g, '<br>')}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Inter,Segoe UI,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0b0b0b;border-bottom:3px solid #e61e32;padding:18px 24px;color:#fff;font-size:18px;font-weight:700;letter-spacing:.08em">LOCI360</td></tr>
<tr><td style="padding:24px"><h1 style="margin:0 0 12px;font-size:20px;color:#111827">${escapeHtml(title)}</h1>
<p style="margin:0 0 16px;color:#374151;line-height:1.5">${escapeHtml(intro).replace(/\n/g, '<br>')}</p>
<table cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.4">${body}</table>
${footer ? `<p style="margin:20px 0 0;color:#6b7280;font-size:13px;line-height:1.5">${escapeHtml(footer).replace(/\n/g, '<br>')}</p>` : ''}
</td></tr></table></td></tr></table></body></html>`;
}

@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');
  private readonly transport = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.secure,
    auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.password } : undefined,
  });

  async send(msg: MailMessage) {
    try {
      await this.transport.sendMail({ from: cfg.smtp.from, ...msg });
    } catch (e) {
      this.log.error(`Mail to ${String(msg.to)} failed: ${(e as Error).message}`);
      throw e;
    }
  }
}
