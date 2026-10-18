import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const trimLower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
export const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class LoginDto {
  @Transform(trimLower)
  @IsEmail({}, { message: 'INVALID_EMAIL' })
  email: string;

  @IsString()
  @MaxLength(200)
  password: string;
}

export class MfaLoginDto {
  @IsString()
  @MaxLength(200)
  mfaToken: string;

  @Transform(trim)
  @Matches(/^\d{6}$/, { message: 'INVALID_CODE' })
  code: string;
}

export class TotpCodeDto {
  @Transform(trim)
  @Matches(/^\d{6}$/, { message: 'INVALID_CODE' })
  code: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword: string;

  @IsString()
  @MinLength(10, { message: 'PASSWORD_TOO_SHORT' })
  @MaxLength(200)
  newPassword: string;
}
