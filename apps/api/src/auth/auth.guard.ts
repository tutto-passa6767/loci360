import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@loci/db';
import { AppError } from '../common/errors';
import { AuthedRequest, IS_PUBLIC, ROLES, SESSION_COOKIE } from './auth.types';
import { SessionService } from './session.service';

/** Global guard: everything except @Public() routes needs a CMS session. Rights are checked here, not in the UI. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);

    const token = req.cookies?.[SESSION_COOKIE];
    if (token && !isPublic) {
      const resolved = await this.sessions.resolve(token);
      if (resolved) {
        req.user = resolved.user;
        req.sessionId = resolved.sessionId;
      }
    }
    if (isPublic) return true;

    const user = req.user;
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in required');
    if (user.blockedAt) throw new AppError(403, 'ACCOUNT_BLOCKED', 'Account is blocked');

    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES, targets);
    if (roles?.length && !roles.includes(user.role)) throw new AppError(403, 'FORBIDDEN', 'Not enough rights');
    return true;
  }
}
