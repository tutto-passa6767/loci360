import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { hashPassword } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { SessionService } from '../auth/session.service';
import { AuditService } from '../common/audit.service';
import { AppError, notFound } from '../common/errors';
import { guardWrite } from '../common/prisma-errors';
import { PrismaService } from '../common/prisma.service';
import { CreateUserDto, PageQuery, UserPatchDto } from './admin.dto';

const USER_LIST_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  blockedAt: true,
  totpEnabledAt: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

/** CMS team (administrators only) and the activity log */
@Injectable()
export class UsersAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return { items: await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' }, select: USER_LIST_SELECT }) };
  }

  /** Short list for "assign to" pickers — available to every editor */
  async team() {
    return { items: await this.prisma.user.findMany({ where: { blockedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } }) };
  }

  async create(dto: CreateUserDto, actor: AuthUser, req: Request) {
    const passwordHash = await hashPassword(dto.password);
    const user = await guardWrite(
      () =>
        this.prisma.user.create({
          data: { email: dto.email, name: dto.name, role: dto.role, passwordHash },
          select: USER_LIST_SELECT,
        }),
      'User',
    );
    await this.audit.record({ action: 'user.created', actorId: actor.id, targetType: 'user', targetId: user.id, req, meta: { email: dto.email, role: dto.role } });
    return user;
  }

  async update(id: string, dto: UserPatchDto, actor: AuthUser, req: Request) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound('User');
    if (id === actor.id && (dto.blocked || (dto.role && dto.role !== 'ADMIN'))) {
      throw new AppError(400, 'CANNOT_DEMOTE_SELF', 'You cannot block yourself or remove your own admin role');
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        role: dto.role,
        ...(dto.blocked !== undefined ? { blockedAt: dto.blocked ? new Date() : null } : {}),
        ...(dto.password ? { passwordHash: await hashPassword(dto.password) } : {}),
        ...(dto.reset2fa ? { totpSecret: null, totpEnabledAt: null } : {}),
      },
      select: USER_LIST_SELECT,
    });
    // A blocked user or a new password ends every open session
    if (dto.blocked || dto.password) await this.sessions.revokeAllExcept(id);
    await this.audit.record({
      action: 'user.updated',
      actorId: actor.id,
      targetType: 'user',
      targetId: id,
      req,
      meta: { fields: Object.keys(dto).filter((k) => k !== 'password'), passwordReset: !!dto.password },
    });
    return updated;
  }

  async remove(id: string, actor: AuthUser, req: Request) {
    if (id === actor.id) throw new AppError(400, 'CANNOT_DELETE_SELF', 'You cannot delete yourself');
    const user = await this.prisma.user.findUnique({ where: { id }, select: { email: true } });
    if (!user) throw notFound('User');
    await this.prisma.user.delete({ where: { id } });
    await this.audit.record({ action: 'user.deleted', actorId: actor.id, targetType: 'user', targetId: id, req, meta: user });
    return { ok: true };
  }

  async auditLog(q: PageQuery) {
    const limit = q.limit ?? 100;
    const page = q.page ?? 1;
    const where = q.q ? { action: { contains: q.q } } : {};
    const [total, rows] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    ]);
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
    const actors = await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
    return {
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      items: rows.map((r) => ({ ...r, actor: actors.find((a) => a.id === r.actorId) ?? null })),
    };
  }
}
