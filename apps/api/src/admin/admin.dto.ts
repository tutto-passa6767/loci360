import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  AssetKind,
  Connectivity,
  DroneRule,
  HeavyAccess,
  LeadStatus,
  MediaRole,
  PowerSupply,
  PublishStatus,
  Season,
  ServiceCategory,
  TermKind,
  TimeOfDay,
  UserRole,
} from '@loci/db';
import { trim, trimLower } from '../auth/auth.dto';

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Empty strings from forms become null so optional columns are cleared */
const nullable = ({ value }: { value: unknown }) => (typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value);

export class PageQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}

// ---------------------------------------------------------------- locations

export class LocationsQuery extends PageQuery {
  @IsOptional()
  @IsEnum(PublishStatus)
  status?: PublishStatus;

  @IsOptional()
  @IsString()
  clusterId?: string;
}

/** Every editable column of a location. All optional so the same DTO serves create (with required checks in the service) and patch. */
export class LocationDto {
  @IsOptional() @Matches(SLUG_RE, { message: 'INVALID_SLUG' }) @MaxLength(80) slug?: string;
  @IsOptional() @IsEnum(PublishStatus) status?: PublishStatus;

  @IsOptional() @Transform(trim) @IsString() @Length(1, 160) nameEn?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(160) nameRu?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(300) summaryEn?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(300) summaryRu?: string;
  @IsOptional() @IsString() @MaxLength(20000) descriptionEn?: string;
  @IsOptional() @IsString() @MaxLength(20000) descriptionRu?: string;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(120) regionEn?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(120) regionRu?: string | null;
  @IsOptional() @Transform(nullable) @IsString() clusterId?: string | null;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) lat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) lng?: number;
  @IsOptional() @Transform(nullable) @Type(() => Number) @IsInt() @Min(-500) @Max(9000) elevationM?: number | null;

  @IsOptional() @Transform(nullable) @Matches(/^[A-Z]{3}$/, { message: 'INVALID_IATA' }) airportCode?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(120) airportNameEn?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(120) airportNameRu?: string | null;
  @IsOptional() @Transform(nullable) @Type(() => Number) @IsInt() @Min(0) @Max(5000) airportKm?: number | null;
  @IsOptional() @Transform(nullable) @Type(() => Number) @IsNumber() @Min(0) @Max(100) driveHours?: number | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(120) railStationEn?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(120) railStationRu?: string | null;
  @IsOptional() @Transform(nullable) @Type(() => Number) @IsInt() @Min(0) @Max(5000) railKm?: number | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(120) nearestTownEn?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(120) nearestTownRu?: string | null;
  @IsOptional() @Transform(nullable) @Type(() => Number) @IsInt() @Min(0) @Max(5000) townKm?: number | null;
  @IsOptional() @IsEnum(HeavyAccess) heavyAccess?: HeavyAccess;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(2000) accessNotesEn?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(2000) accessNotesRu?: string | null;

  @IsOptional() @IsEnum(Connectivity) connectivity?: Connectivity;
  @IsOptional() @IsEnum(PowerSupply) power?: PowerSupply;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(500) hotelsEn?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(500) hotelsRu?: string | null;
  @IsOptional() @Transform(nullable) @Type(() => Number) @IsInt() @Min(0) @Max(5000) hotelKm?: number | null;

  @IsOptional() @IsBoolean() nationalPark?: boolean;
  @IsOptional() @IsBoolean() borderZone?: boolean;
  @IsOptional() @IsEnum(DroneRule) drone?: DroneRule;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(2000) permitNotesEn?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(2000) permitNotesRu?: string | null;

  @IsOptional() @IsArray() @IsEnum(Season, { each: true }) seasons?: Season[];
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(1000) climateEn?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(1000) climateRu?: string | null;

  @IsOptional() @IsBoolean() featured?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sort?: number;
  @IsOptional() @Transform(nullable) @IsString() coverAssetId?: string | null;

  @IsOptional() @Transform(nullable) @IsString() @MaxLength(120) seoTitleEn?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(120) seoTitleRu?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(300) seoDescriptionEn?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(300) seoDescriptionRu?: string | null;
  @IsOptional() @Transform(nullable) @IsString() ogAssetId?: string | null;

  /** Replaces the location's terms (genres, landscapes, eras, tags) */
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) termIds?: string[];
}

export class LocationMediaItemDto {
  @IsString() assetId: string;
  @IsEnum(MediaRole) role: MediaRole;
  @IsOptional() @IsEnum(TimeOfDay) timeOfDay?: TimeOfDay | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(80) labelEn?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(80) labelRu?: string | null;
}

/** Full ordered list of media attached to a location */
export class LocationMediaDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LocationMediaItemDto)
  items: LocationMediaItemDto[];
}

/** One file added to a location (or put in place of another one) — the photo manager saves every action at once */
export class AttachMediaDto {
  @IsString() assetId: string;
  /** The attached file takes this file's place: position, time of day, labels, cover and OG */
  @IsOptional() @IsString() replaceAssetId?: string;
  /** Where the file goes (e.g. a video as the showreel or as B-roll); by default it follows the file kind */
  @IsOptional() @IsEnum(MediaRole) role?: MediaRole;
  @IsOptional() @IsEnum(TimeOfDay) timeOfDay?: TimeOfDay;
  @IsOptional() @IsBoolean() cover?: boolean;
}

export class MediaItemPatchDto {
  /** Showreel ↔ B-roll for videos; the role must fit the file kind */
  @IsOptional() @IsEnum(MediaRole) role?: MediaRole;
  @IsOptional() @Transform(nullable) @IsEnum(TimeOfDay) timeOfDay?: TimeOfDay | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(80) labelEn?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(80) labelRu?: string | null;
  /** true makes this photo the location cover */
  @IsOptional() @IsBoolean() cover?: boolean;
}

/** New order for some of the location's files; the rest keep their places */
export class MediaOrderDto {
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) assetIds: string[];
}

// ---------------------------------------------------------------- taxonomy & clusters

export class TermDto {
  @IsOptional() @IsEnum(TermKind) kind?: TermKind;
  @IsOptional() @Matches(SLUG_RE, { message: 'INVALID_SLUG' }) @MaxLength(80) slug?: string;
  @IsOptional() @Transform(trim) @IsString() @Length(1, 80) labelEn?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) labelRu?: string;
  @IsOptional() @Type(() => Number) @IsInt() sort?: number;
}

export class ClusterDto {
  @IsOptional() @Matches(SLUG_RE, { message: 'INVALID_SLUG' }) @MaxLength(80) slug?: string;
  @IsOptional() @Transform(trim) @IsString() @Length(1, 120) nameEn?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) nameRu?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(160) taglineEn?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(160) taglineRu?: string;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(4000) descriptionEn?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(4000) descriptionRu?: string | null;
  @IsOptional() @Transform(nullable) @IsString() coverAssetId?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) lat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) lng?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(18) zoom?: number;
  @IsOptional() @Type(() => Number) @IsInt() sort?: number;
}

// ---------------------------------------------------------------- media library & uploads

export class AssetsQuery extends PageQuery {
  @IsOptional() @IsEnum(AssetKind) kind?: AssetKind;
  @IsOptional() @IsIn(['UPLOADING', 'PENDING', 'RUNNING', 'READY', 'FAILED']) state?: string;
}

export class AssetPatchDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 200) title?: string;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(200) credit?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(300) altEn?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(300) altRu?: string | null;
  /** Changing it re-encodes the video */
  @IsOptional() @IsBoolean() watermark?: boolean;
}

export class StartUploadDto {
  @IsString() @MaxLength(255) fileName: string;
  @Type(() => Number) @IsInt() @Min(1) size: number;
  @IsOptional() @IsString() @MaxLength(200) mimeType?: string;
  /** PANORAMA must be chosen explicitly: an equirectangular photo looks like any other JPEG */
  @IsOptional() @IsEnum(AssetKind) kind?: AssetKind;
  @IsOptional() @IsBoolean() watermark?: boolean;
}

export class SignPartsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  partNumbers: number[];
}

// ---------------------------------------------------------------- home hero

export class HeroReelDto {
  @Matches(/^[a-z0-9-]{1,40}$/) key: string;
  @Transform(trim) @IsString() @Length(1, 40) labelEn: string;
  @Transform(trim) @IsString() @MaxLength(40) labelRu: string;
  @IsOptional() @Transform(nullable) @IsString() assetId?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(80) genreSlug?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(80) locationSlug?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class HeroDto {
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => HeroReelDto)
  items: HeroReelDto[];
}

// ---------------------------------------------------------------- pages & services

export class PageDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 160) titleEn?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(160) titleRu?: string;
  @IsOptional() @IsString() @MaxLength(1000) leadEn?: string;
  @IsOptional() @IsString() @MaxLength(1000) leadRu?: string;
  @IsOptional() @IsString() @MaxLength(100000) bodyEn?: string;
  @IsOptional() @IsString() @MaxLength(100000) bodyRu?: string;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(120) seoTitleEn?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(120) seoTitleRu?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(300) seoDescriptionEn?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(300) seoDescriptionRu?: string | null;
  @IsOptional() @Transform(nullable) @IsString() ogAssetId?: string | null;
  @IsOptional() @IsBoolean() published?: boolean;
}

export class ServiceCompanyDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 160) name?: string;
  @IsOptional() @IsEnum(ServiceCategory) category?: ServiceCategory;
  @IsOptional() @Transform(trim) @IsString() @Length(1, 80) cityEn?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) cityRu?: string;
  @IsOptional() @IsString() @MaxLength(2000) descriptionEn?: string;
  @IsOptional() @IsString() @MaxLength(2000) descriptionRu?: string;
  @IsOptional() @Transform(nullable) @Matches(/^https?:\/\/\S+$/, { message: 'INVALID_URL' }) @MaxLength(300) website?: string | null;
  @IsOptional() @Transform(nullable) @IsEmail({}, { message: 'INVALID_EMAIL' }) email?: string | null;
  @IsOptional() @Transform(nullable) @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @Transform(nullable) @IsString() logoAssetId?: string | null;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sort?: number;
}

// ---------------------------------------------------------------- leads

export class LeadsQuery extends PageQuery {
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @IsString() assigneeId?: string;
}

export class LeadPatchDto {
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @Transform(nullable) @IsString() assigneeId?: string | null;
}

export class LeadNoteDto {
  @Transform(trim) @IsString() @Length(1, 4000) body: string;
}

// ---------------------------------------------------------------- users

export class CreateUserDto {
  @Transform(trimLower) @IsEmail({}, { message: 'INVALID_EMAIL' }) @MaxLength(254) email: string;
  @Transform(trim) @IsString() @Length(1, 100) name: string;
  @IsString() @MinLength(10, { message: 'PASSWORD_TOO_SHORT' }) @MaxLength(200) password: string;
  @IsEnum(UserRole) role: UserRole;
}

export class UserPatchDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 100) name?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsBoolean() blocked?: boolean;
  @IsOptional() @IsString() @MinLength(10, { message: 'PASSWORD_TOO_SHORT' }) @MaxLength(200) password?: string;
  /** Turns off 2FA for a user who lost their phone */
  @IsOptional() @IsBoolean() reset2fa?: boolean;
}

/** A 360° view from a panorama service: the pasted embed code (or player link), labels and credit */
export class PanoramaEmbedItemDto {
  @IsString() @Length(1, 4000) code: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) labelEn?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) labelRu?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) credit?: string;
}

export class PanoramaEmbedsDto {
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => PanoramaEmbedItemDto)
  items: PanoramaEmbedItemDto[];
}
