import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from './prisma.service';

export interface AuditInput {
  action: string;
  actorId?: string | null;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
  req?: Request;
}

/** CMS activity log. Read-only from the admin panel — there is no API to change entries. */
@Injectable()
export class AuditService {
  private readonly log = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          action: input.action,
          actorId: input.actorId ?? null,
          targetType: input.targetType,
          targetId: input.targetId,
          meta: (input.meta ?? undefined) as any,
          ip: input.req?.ip,
        },
      });
    } catch (e) {
      // A failed log write must not break the user's action, but it must be visible
      this.log.error(`Could not record ${input.action}: ${(e as Error).message}`);
    }
  }
}
