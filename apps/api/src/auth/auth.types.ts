import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { UserRole } from '@loci/db';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  blockedAt: Date | null;
  totpEnabledAt: Date | null;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
  sessionId?: string;
}

export const SESSION_COOKIE = 'loci_sid';
export const CSRF_COOKIE = 'loci_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** Route is open to visitors (the user is still attached when a CMS session exists) */
export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route is limited to these CMS roles */
export const ROLES = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user!;
});
