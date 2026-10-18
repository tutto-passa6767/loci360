import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Roles } from '../auth/auth.types';
import {
  AssetPatchDto,
  AssetsQuery,
  AttachMediaDto,
  ClusterDto,
  CreateUserDto,
  HeroDto,
  LeadNoteDto,
  LeadPatchDto,
  LeadsQuery,
  LocationDto,
  LocationMediaDto,
  MediaItemPatchDto,
  MediaOrderDto,
  PanoramaEmbedsDto,
  LocationsQuery,
  PageDto,
  PageQuery,
  ServiceCompanyDto,
  SignPartsDto,
  StartUploadDto,
  TermDto,
  UserPatchDto,
} from './admin.dto';
import { ContentAdminService } from './content.admin.service';
import { LeadsAdminService } from './leads.admin.service';
import { LocationsAdminService } from './locations.admin.service';
import { MediaAdminService } from './media.admin.service';
import { UsersAdminService } from './users.admin.service';
import { StatsService } from '../common/stats.service';
import { NewsletterService } from '../public/newsletter.service';

class StatsQuery {
  @IsOptional()
  @IsIn(['7', '30', '90'])
  days?: string;
}

class IdsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids: string[];
}

// Every route here requires a CMS session (global AuthGuard); user and settings management — ADMIN only.

@Controller('admin/locations')
export class LocationsAdminController {
  constructor(private readonly svc: LocationsAdminService) {}

  @Get()
  list(@Query() q: LocationsQuery) {
    return this.svc.list(q);
  }

  @Post()
  create(@Body() dto: LocationDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.create(dto, u, req);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: LocationDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.update(id, dto, u, req);
  }

  @Put(':id/media')
  media(@Param('id') id: string, @Body() dto: LocationMediaDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.setMedia(id, dto, u, req);
  }

  /** Photo manager: every action on a single file is saved at once */
  @Post(':id/media')
  attachMedia(@Param('id') id: string, @Body() dto: AttachMediaDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.attachMedia(id, dto, u, req);
  }

  @Put(':id/media/order')
  orderMedia(@Param('id') id: string, @Body() dto: MediaOrderDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.orderMedia(id, dto, u, req);
  }

  @Patch(':id/media/:assetId')
  patchMedia(@Param('id') id: string, @Param('assetId') assetId: string, @Body() dto: MediaItemPatchDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.patchMedia(id, assetId, dto, u, req);
  }

  @Delete(':id/media/:assetId')
  detachMedia(@Param('id') id: string, @Param('assetId') assetId: string, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.detachMedia(id, assetId, u, req);
  }

  /** 360° views hosted by panorama services (licensed embed codes) */
  @Put(':id/embeds')
  embeds(@Param('id') id: string, @Body() dto: PanoramaEmbedsDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.setEmbeds(id, dto, u, req);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.remove(id, u, req);
  }
}

@Controller('admin/assets')
export class AssetsAdminController {
  constructor(private readonly svc: MediaAdminService) {}

  @Get()
  list(@Query() q: AssetsQuery) {
    return this.svc.list(q);
  }

  @HttpCode(200)
  @Post('states')
  states(@Body() dto: IdsDto) {
    return this.svc.states(dto.ids);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: AssetPatchDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.update(id, dto, u, req);
  }

  @HttpCode(200)
  @Post(':id/reprocess')
  reprocess(@Param('id') id: string, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.reprocess(id, u, req);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.remove(id, u, req);
  }
}

@Controller('admin/uploads')
export class UploadsAdminController {
  constructor(private readonly svc: MediaAdminService) {}

  @Post()
  start(@Body() dto: StartUploadDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.startUpload(dto, u, req);
  }

  @Get(':id')
  status(@Param('id') id: string) {
    return this.svc.uploadStatus(id);
  }

  @HttpCode(200)
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post(':id/parts')
  parts(@Param('id') id: string, @Body() dto: SignPartsDto) {
    return this.svc.signParts(id, dto.partNumbers);
  }

  @HttpCode(200)
  @Post(':id/complete')
  complete(@Param('id') id: string, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.completeUpload(id, u, req);
  }

  @Delete(':id')
  abort(@Param('id') id: string, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.abortUpload(id, u, req);
  }
}

@Controller('admin')
export class ContentAdminController {
  constructor(private readonly svc: ContentAdminService) {}

  @Get('terms')
  terms() {
    return this.svc.terms();
  }

  @Post('terms')
  createTerm(@Body() dto: TermDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.createTerm(dto, u, req);
  }

  @Patch('terms/:id')
  updateTerm(@Param('id') id: string, @Body() dto: TermDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.updateTerm(id, dto, u, req);
  }

  @Delete('terms/:id')
  deleteTerm(@Param('id') id: string, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.deleteTerm(id, u, req);
  }

  @Get('clusters')
  clusters() {
    return this.svc.clusters();
  }

  @Post('clusters')
  createCluster(@Body() dto: ClusterDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.createCluster(dto, u, req);
  }

  @Patch('clusters/:id')
  updateCluster(@Param('id') id: string, @Body() dto: ClusterDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.updateCluster(id, dto, u, req);
  }

  @Delete('clusters/:id')
  deleteCluster(@Param('id') id: string, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.deleteCluster(id, u, req);
  }

  @Get('hero')
  hero() {
    return this.svc.hero();
  }

  @Put('hero')
  setHero(@Body() dto: HeroDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.setHero(dto, u, req);
  }

  @Get('pages')
  pages() {
    return this.svc.pages();
  }

  @Get('pages/:slug')
  page(@Param('slug') slug: string) {
    return this.svc.page(slug);
  }

  @Patch('pages/:slug')
  updatePage(@Param('slug') slug: string, @Body() dto: PageDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.updatePage(slug, dto, u, req);
  }

  @Get('services')
  services() {
    return this.svc.services();
  }

  @Post('services')
  createService(@Body() dto: ServiceCompanyDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.createService(dto, u, req);
  }

  @Patch('services/:id')
  updateService(@Param('id') id: string, @Body() dto: ServiceCompanyDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.updateService(id, dto, u, req);
  }

  @Delete('services/:id')
  deleteService(@Param('id') id: string, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.deleteService(id, u, req);
  }

  @Get('settings')
  settings() {
    return this.svc.getSettings();
  }

  @Roles('ADMIN')
  @Put('settings/:key')
  setSetting(@Param('key') key: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.setSetting(key, body, u, req);
  }
}

@Controller('admin/leads')
export class LeadsAdminController {
  constructor(private readonly svc: LeadsAdminService) {}

  @Get()
  list(@Query() q: LeadsQuery) {
    return this.svc.list(q);
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="loci360-requests.csv"')
  export(@Query() q: LeadsQuery) {
    return this.svc.exportCsv(q);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: LeadPatchDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.update(id, dto, u, req);
  }

  @Post(':id/notes')
  note(@Param('id') id: string, @Body() dto: LeadNoteDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.addNote(id, dto, u, req);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.remove(id, u, req);
  }
}

@Controller('admin')
export class TeamAdminController {
  constructor(
    private readonly users: UsersAdminService,
    private readonly leads: LeadsAdminService,
    private readonly stats: StatsService,
  ) {}

  /** Anonymous site statistics (views, visits, downloads, requests) */
  @Get('stats')
  siteStats(@Query() q: StatsQuery) {
    return this.stats.report(Number(q.days ?? 30));
  }

  @Get('dashboard')
  dashboard() {
    return this.leads.dashboard();
  }

  @Get('team')
  team() {
    return this.users.team();
  }

  @Roles('ADMIN')
  @Get('users')
  list() {
    return this.users.list();
  }

  @Roles('ADMIN')
  @Post('users')
  create(@Body() dto: CreateUserDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.users.create(dto, u, req);
  }

  @Roles('ADMIN')
  @Patch('users/:id')
  update(@Param('id') id: string, @Body() dto: UserPatchDto, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.users.update(id, dto, u, req);
  }

  @Roles('ADMIN')
  @Delete('users/:id')
  remove(@Param('id') id: string, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.users.remove(id, u, req);
  }

  @Roles('ADMIN')
  @Get('audit')
  audit(@Query() q: PageQuery) {
    return this.users.auditLog(q);
  }
}

class SubscribersQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsString()
  @MaxLength(254)
  search?: string;
}

@Controller('admin/subscribers')
export class SubscribersAdminController {
  constructor(private readonly svc: NewsletterService) {}

  @Get()
  list(@Query() q: SubscribersQuery) {
    return this.svc.list(q);
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="loci360-subscribers.csv"')
  export() {
    return this.svc.exportCsv();
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.svc.remove(id, u.id, req);
  }
}
