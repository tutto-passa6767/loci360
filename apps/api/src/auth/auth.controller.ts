import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuditService } from '../common/audit.service';
import { AppError } from '../common/errors';
import { ChangePasswordDto, LoginDto, MfaLoginDto, TotpCodeDto } from './auth.dto';
import { AuthService } from './auth.service';
import { AuthedRequest, AuthUser, CurrentUser, Public } from './auth.types';
import { SessionService } from './session.service';
import { mfaToken } from './totp';

const AUTH_LIMIT = { default: { limit: 10, ttl: 60_000 } };

/** CMS sign-in. There is no public sign-up: editors are created by an administrator. */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  /** Issues the CSRF cookie before the first state-changing request */
  @Public()
  @Get('csrf')
  csrf() {
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    try {
      const user = await this.auth.login(dto.email, dto.password);
      // With 2FA on, the session is issued only after the authenticator code
      if (user.totpEnabledAt) return { mfaRequired: true, mfaToken: mfaToken(user.id) };
      const token = await this.sessions.create(user.id, req.ip, req.headers['user-agent']);
      this.sessions.setCookie(res, token);
      await this.audit.record({ action: 'auth.login', actorId: user.id, targetType: 'user', targetId: user.id, req });
      return { user };
    } catch (e) {
      if (e instanceof AppError) {
        await this.audit.record({ action: 'auth.login_failed', req, meta: { email: dto.email, code: (e.getResponse() as any).code } });
      }
      throw e;
    }
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('login/mfa')
  async loginMfa(@Body() dto: MfaLoginDto, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    try {
      const user = await this.auth.loginMfa(dto.mfaToken, dto.code);
      const token = await this.sessions.create(user.id, req.ip, req.headers['user-agent']);
      this.sessions.setCookie(res, token);
      await this.audit.record({ action: 'auth.login', actorId: user.id, targetType: 'user', targetId: user.id, req, meta: { mfa: true } });
      return { user };
    } catch (e) {
      await this.audit.record({ action: 'auth.mfa_failed', req });
      throw e;
    }
  }

  @HttpCode(200)
  @Post('logout')
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    if (req.sessionId) await this.sessions.revoke(req.sessionId);
    this.sessions.clearCookie(res);
    await this.audit.record({ action: 'auth.logout', actorId: req.user?.id, req });
    return { ok: true };
  }

  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('2fa/setup')
  setup2fa(@CurrentUser() user: AuthUser) {
    return this.auth.setupTotp(user.id);
  }

  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('2fa/enable')
  async enable2fa(@CurrentUser() user: AuthUser, @Body() dto: TotpCodeDto, @Req() req: AuthedRequest) {
    await this.auth.enableTotp(user.id, dto.code);
    await this.audit.record({ action: 'auth.2fa_enabled', actorId: user.id, targetType: 'user', targetId: user.id, req });
    return { ok: true };
  }

  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('2fa/disable')
  async disable2fa(@CurrentUser() user: AuthUser, @Body() dto: TotpCodeDto, @Req() req: AuthedRequest) {
    await this.auth.disableTotp(user.id, dto.code);
    await this.audit.record({ action: 'auth.2fa_disabled', actorId: user.id, targetType: 'user', targetId: user.id, req });
    return { ok: true };
  }

  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('password')
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @Req() req: AuthedRequest) {
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
    await this.sessions.revokeAllExcept(user.id, req.sessionId);
    await this.audit.record({ action: 'auth.password_changed', actorId: user.id, targetType: 'user', targetId: user.id, req });
    return { ok: true };
  }
}
