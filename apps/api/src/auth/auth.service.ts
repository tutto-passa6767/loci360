import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import QRCode from 'qrcode';
import { AppError } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { USER_SELECT } from './session.service';
import { decryptSecret, encryptSecret, generateSecret, otpauthUrl, readMfaToken, verifyTotp } from './totp';

/** Argon2id parameters recommended by OWASP */
export const ARGON = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => argon2.hash(password, ARGON);

@Injectable()
export class AuthService {
  /** Decoy hash: a sign-in with an unknown email takes as long as a real password check */
  private dummyHash = argon2.hash('loci-dummy-password', ARGON);

  constructor(private readonly prisma: PrismaService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      await argon2.verify(await this.dummyHash, password).catch(() => false);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Wrong email or password');
    }
    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Wrong email or password');
    if (user.blockedAt) throw new AppError(403, 'ACCOUNT_BLOCKED', 'Account is blocked');
    return this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: USER_SELECT });
  }

  /** Second sign-in step: code from the authenticator app */
  async loginMfa(token: string, code: string) {
    const userId = readMfaToken(token);
    if (!userId) throw new AppError(401, 'MFA_EXPIRED', 'Time for the code ran out — sign in again');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.totpSecret || !user.totpEnabledAt || user.blockedAt) throw new AppError(401, 'MFA_EXPIRED', 'Sign in again');
    if (!verifyTotp(decryptSecret(user.totpSecret), code)) throw new AppError(401, 'INVALID_CODE', 'Wrong code');
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: USER_SELECT });
  }

  /** New secret is stored but only takes effect after it is confirmed with a code */
  async setupTotp(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabledAt) throw new AppError(409, 'MFA_ALREADY_ENABLED', 'Two-factor authentication is already on');
    const secret = generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { totpSecret: encryptSecret(secret) } });
    const url = otpauthUrl(secret, user.email);
    return { secret, otpauthUrl: url, qrSvg: await QRCode.toString(url, { type: 'svg', margin: 1, width: 200 }) };
  }

  async enableTotp(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpSecret) throw new AppError(409, 'MFA_NOT_SETUP', 'Get a key first');
    if (!verifyTotp(decryptSecret(user.totpSecret), code)) throw new AppError(400, 'INVALID_CODE', 'Wrong code');
    await this.prisma.user.update({ where: { id: userId }, data: { totpEnabledAt: new Date() } });
  }

  async disableTotp(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpSecret || !user.totpEnabledAt) return;
    if (!verifyTotp(decryptSecret(user.totpSecret), code)) throw new AppError(400, 'INVALID_CODE', 'Wrong code');
    await this.prisma.user.update({ where: { id: userId }, data: { totpEnabledAt: null, totpSecret: null } });
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, current).catch(() => false))) {
      throw new AppError(400, 'INVALID_CREDENTIALS', 'Current password is wrong');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
  }
}
