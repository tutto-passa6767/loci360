import { Injectable } from '@nestjs/common';
import type { LeadStatus, Prisma } from '@loci/db';
import type { Request } from 'express';
import { AuthUser } from '../auth/auth.types';
import { AuditService } from '../common/audit.service';
import { AppError, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { BUDGETS, PROJECT_TYPES } from '../public/leads.service';
import { LeadNoteDto, LeadPatchDto, LeadsQuery } from './admin.dto';

const OPEN: LeadStatus[] = ['NEW', 'IN_PROGRESS', 'PROPOSAL'];

const csvCell = (v: unknown) => {
  const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
  // Formula-looking cells are prefixed so spreadsheets do not execute them
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** CRM-lite: scouting requests, their status, owner and internal notes */
@Injectable()
export class LeadsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private where(q: LeadsQuery): Prisma.LeadWhereInput {
    const or: Prisma.LeadWhereInput[] = [];
    if (q.q) {
      const n = Number(q.q.replace(/^#/, ''));
      if (Number.isInteger(n) && n > 0) or.push({ number: n });
      for (const field of ['name', 'email', 'company', 'country'] as const) or.push({ [field]: { contains: q.q, mode: 'insensitive' } });
    }
    return {
      ...(q.status ? { status: q.status } : {}),
      ...(q.assigneeId ? { assigneeId: q.assigneeId === 'none' ? null : q.assigneeId } : {}),
      ...(or.length ? { OR: or } : {}),
    };
  }

  async list(q: LeadsQuery) {
    const limit = q.limit ?? 50;
    const page = q.page ?? 1;
    const where = this.where(q);
    const [total, rows, counts] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          assignee: { select: { id: true, name: true } },
          locations: { select: { location: { select: { id: true, nameEn: true, slug: true } } } },
          _count: { select: { notes: true } },
        },
      }),
      this.prisma.lead.groupBy({ by: ['status'], _count: true }),
    ]);
    return {
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      items: rows.map(({ locations, _count, ip: _ip, userAgent: _ua, ...l }) => ({
        ...l,
        locations: locations.map((x) => x.location),
        notes: _count.notes,
      })),
    };
  }

  async get(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        locations: { select: { location: { select: { id: true, nameEn: true, slug: true, status: true } } } },
        notes: { orderBy: { createdAt: 'asc' }, include: { author: { select: { id: true, name: true } } } },
      },
    });
    if (!lead) throw notFound('Request');
    return { ...lead, locations: lead.locations.map((x) => x.location) };
  }

  async update(id: string, dto: LeadPatchDto, user: AuthUser, req: Request) {
    const lead = await this.prisma.lead.findUnique({ where: { id }, include: { assignee: { select: { name: true } } } });
    if (!lead) throw notFound('Request');
    const notes: Prisma.LeadNoteCreateManyInput[] = [];
    if (dto.status && dto.status !== lead.status) {
      notes.push({ leadId: id, authorId: user.id, kind: 'STATUS', body: `${lead.status} → ${dto.status}` });
    }
    if (dto.assigneeId !== undefined && dto.assigneeId !== lead.assigneeId) {
      const next = dto.assigneeId ? await this.prisma.user.findUnique({ where: { id: dto.assigneeId }, select: { name: true, blockedAt: true } }) : null;
      if (dto.assigneeId && (!next || next.blockedAt)) throw new AppError(400, 'BAD_ASSIGNEE', 'This team member cannot take requests');
      notes.push({ leadId: id, authorId: user.id, kind: 'ASSIGN', body: `${lead.assignee?.name ?? '—'} → ${next?.name ?? '—'}` });
    }
    await this.prisma.$transaction([
      this.prisma.lead.update({ where: { id }, data: { status: dto.status, assigneeId: dto.assigneeId } }),
      this.prisma.leadNote.createMany({ data: notes }),
    ]);
    await this.audit.record({ action: 'lead.updated', actorId: user.id, targetType: 'lead', targetId: id, req, meta: { ...dto } });
    return this.get(id);
  }

  async addNote(id: string, dto: LeadNoteDto, user: AuthUser, req: Request) {
    if (!(await this.prisma.lead.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Request');
    await this.prisma.$transaction([
      this.prisma.leadNote.create({ data: { leadId: id, authorId: user.id, kind: 'NOTE', body: dto.body } }),
      this.prisma.lead.update({ where: { id }, data: { updatedAt: new Date() } }),
    ]);
    await this.audit.record({ action: 'lead.note', actorId: user.id, targetType: 'lead', targetId: id, req });
    return this.get(id);
  }

  async remove(id: string, user: AuthUser, req: Request) {
    const lead = await this.prisma.lead.findUnique({ where: { id }, select: { number: true } });
    if (!lead) throw notFound('Request');
    await this.prisma.lead.delete({ where: { id } });
    await this.audit.record({ action: 'lead.deleted', actorId: user.id, targetType: 'lead', targetId: id, req, meta: lead });
    return { ok: true };
  }

  async exportCsv(q: LeadsQuery) {
    const rows = await this.prisma.lead.findMany({
      where: this.where(q),
      orderBy: { createdAt: 'desc' },
      take: 10_000,
      include: { assignee: { select: { name: true } }, locations: { select: { location: { select: { nameEn: true } } } } },
    });
    const header = ['Number', 'Created', 'Status', 'Type', 'Name', 'Email', 'Phone', 'Company', 'Country', 'Project type', 'Budget', 'Shoot from', 'Shoot to', 'Locations', 'Message', 'Assignee', 'Language'];
    const lines = rows.map((l) =>
      [
        l.number,
        l.createdAt,
        l.status,
        l.kind === 'QUESTION' ? 'Question' : 'Scouting request',
        l.name,
        l.email,
        l.phone,
        l.company,
        l.country,
        PROJECT_TYPES[l.projectType].en,
        BUDGETS[l.budget].en,
        l.shootFrom?.toISOString().slice(0, 10),
        l.shootTo?.toISOString().slice(0, 10),
        l.locations.map((x) => x.location.nameEn).join('; '),
        l.message,
        l.assignee?.name,
        l.locale,
      ]
        .map(csvCell)
        .join(','),
    );
    // BOM so Excel opens UTF-8 correctly
    return '﻿' + [header.join(','), ...lines].join('\r\n');
  }

  async dashboard() {
    const weekAgo = new Date(Date.now() - 7 * 86400_000);
    const [locations, leads, newThisWeek, processing, failed, recentLeads, topLocations] = await Promise.all([
      this.prisma.location.groupBy({ by: ['status'], _count: true }),
      this.prisma.lead.groupBy({ by: ['status'], _count: true }),
      this.prisma.lead.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.asset.count({ where: { state: { in: ['PENDING', 'RUNNING'] } } }),
      this.prisma.asset.count({ where: { state: 'FAILED' } }),
      this.prisma.lead.findMany({
        where: { status: { in: OPEN } },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { id: true, number: true, name: true, company: true, country: true, status: true, createdAt: true, projectType: true },
      }),
      this.prisma.leadLocation.groupBy({ by: ['locationId'], _count: true, orderBy: { _count: { locationId: 'desc' } }, take: 5 }),
    ]);
    const names = await this.prisma.location.findMany({
      where: { id: { in: topLocations.map((t) => t.locationId) } },
      select: { id: true, nameEn: true, slug: true },
    });
    return {
      locations: Object.fromEntries(locations.map((c) => [c.status, c._count])),
      leads: Object.fromEntries(leads.map((c) => [c.status, c._count])),
      newThisWeek,
      media: { processing, failed },
      recentLeads,
      topLocations: topLocations.map((t) => ({ ...names.find((n) => n.id === t.locationId), requests: t._count })),
    };
  }
}
