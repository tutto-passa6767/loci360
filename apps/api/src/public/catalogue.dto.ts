import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BudgetRange, HeavyAccess, ProjectType, Season } from '@loci/db';
import { trim, trimLower } from '../auth/auth.dto';

/** "a,b,c" → ['a','b','c'] (query strings) */
const csv = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : Array.isArray(value)
      ? value
      : undefined;

const SLUG = /^[a-z0-9-]{1,80}$/;

export class LangQuery {
  @IsOptional()
  @IsIn(['en', 'ru'])
  lang?: 'en' | 'ru';
}

export const SORTS = ['featured', 'name', 'airport', 'elevation', 'newest'] as const;
export type CatalogueSort = (typeof SORTS)[number];

/** Directory filters: OR inside one group, AND across groups */
export class CatalogueQuery extends LangQuery {
  @IsOptional()
  @Transform(csv)
  @IsArray()
  @ArrayMaxSize(30)
  @Matches(SLUG, { each: true })
  genre?: string[];

  @IsOptional()
  @Transform(csv)
  @IsArray()
  @ArrayMaxSize(30)
  @Matches(SLUG, { each: true })
  landscape?: string[];

  @IsOptional()
  @Transform(csv)
  @IsArray()
  @ArrayMaxSize(30)
  @Matches(SLUG, { each: true })
  era?: string[];

  @IsOptional()
  @Transform(csv)
  @IsArray()
  @ArrayMaxSize(30)
  @Matches(SLUG, { each: true })
  tag?: string[];

  @IsOptional()
  @Transform(csv)
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(SLUG, { each: true })
  cluster?: string[];

  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsEnum(Season, { each: true })
  season?: Season[];

  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsEnum(HeavyAccess, { each: true })
  access?: HeavyAccess[];

  /** Max road distance from an airport, km */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  airportKm?: number;

  /** Only locations where drones fly with standard registration */
  @IsOptional()
  @IsIn(['1', 'true'])
  drone?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(SORTS as unknown as string[])
  sort?: CatalogueSort;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  limit?: number;
}

export class CreateLeadDto {
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  name: string;

  @Transform(trimLower)
  @IsEmail({}, { message: 'INVALID_EMAIL' })
  @MaxLength(254)
  email: string;

  @Transform(trim)
  @IsString()
  @Length(1, 200)
  company: string;

  /** ISO 3166-1 alpha-2 */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{2}$/, { message: 'INVALID_COUNTRY' })
  country: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsEnum(ProjectType)
  projectType: ProjectType;

  @IsEnum(BudgetRange)
  budget: BudgetRange;

  @IsOptional()
  @IsDateString({ strict: true }, { message: 'INVALID_DATE' })
  shootFrom?: string;

  @IsOptional()
  @IsDateString({ strict: true }, { message: 'INVALID_DATE' })
  shootTo?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  message?: string;

  /** Slugs of the locations the producer is interested in */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @Matches(SLUG, { each: true })
  locations?: string[];

  @IsOptional()
  @IsIn(['en', 'ru'])
  locale?: 'en' | 'ru';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  sourcePath?: string;

  /** Consent to process the request data (privacy policy) */
  @Equals(true, { message: 'CONSENT_REQUIRED' })
  consent: boolean;

  /** Honeypot — real visitors never see this field */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

/** The short "ask the location manager" form: no company, project or budget */
export class CreateQuestionDto {
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  name: string;

  @Transform(trimLower)
  @IsEmail({}, { message: 'INVALID_EMAIL' })
  @MaxLength(254)
  email: string;

  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  message: string;

  @IsOptional()
  @IsIn(['en', 'ru'])
  locale?: 'en' | 'ru';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  sourcePath?: string;

  @Equals(true, { message: 'CONSENT_REQUIRED' })
  consent: boolean;

  /** Honeypot */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

export class SubscribeDto {
  @Transform(trimLower)
  @IsEmail({}, { message: 'INVALID_EMAIL' })
  @MaxLength(254)
  email: string;

  @IsOptional()
  @IsIn(['en', 'ru'])
  locale?: 'en' | 'ru';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  sourcePath?: string;

  @Equals(true, { message: 'CONSENT_REQUIRED' })
  consent: boolean;

  /** Honeypot */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

export class UnsubscribeDto {
  @Matches(/^[A-Za-z0-9_-]{20,64}$/)
  token: string;
}
