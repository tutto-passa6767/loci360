import { Controller, Get, MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  AssetsAdminController,
  ContentAdminController,
  LeadsAdminController,
  LocationsAdminController,
  SubscribersAdminController,
  TeamAdminController,
  UploadsAdminController,
} from './admin/admin.controllers';
import { ContentAdminService } from './admin/content.admin.service';
import { LeadsAdminService } from './admin/leads.admin.service';
import { LocationsAdminService } from './admin/locations.admin.service';
import { MediaAdminService } from './admin/media.admin.service';
import { UsersAdminService } from './admin/users.admin.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { Public } from './auth/auth.types';
import { SessionService } from './auth/session.service';
import { AuditService } from './common/audit.service';
import { CsrfMiddleware } from './common/csrf.middleware';
import { MailService } from './common/mail.service';
import { MediaPresenter } from './common/media.presenter';
import { PrismaService } from './common/prisma.service';
import { RevalidateService } from './common/revalidate.service';
import { S3Service } from './common/s3.service';
import { SettingsService } from './common/settings.service';
import { SpecSheetService } from './pdf/spec-sheet.service';
import { CatalogueService } from './public/catalogue.service';
import { ClimateService } from './public/climate.service';
import { MediaScoreService } from './common/media-score.service';
import { StatsService } from './common/stats.service';
import { NewsletterService } from './public/newsletter.service';
import { ContentService } from './public/content.service';
import { LeadsService } from './public/leads.service';
import { PublicController } from './public/public.controller';

@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }])],
  controllers: [
    HealthController,
    AuthController,
    PublicController,
    LocationsAdminController,
    AssetsAdminController,
    UploadsAdminController,
    ContentAdminController,
    LeadsAdminController,
    SubscribersAdminController,
    TeamAdminController,
  ],
  providers: [
    PrismaService,
    S3Service,
    AuditService,
    MailService,
    SettingsService,
    RevalidateService,
    MediaPresenter,
    SessionService,
    AuthService,
    CatalogueService,
    ClimateService,
    StatsService,
    MediaScoreService,
    NewsletterService,
    ContentService,
    LeadsService,
    SpecSheetService,
    LocationsAdminService,
    MediaAdminService,
    ContentAdminService,
    LeadsAdminService,
    UsersAdminService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // The anonymous counter changes nothing a visitor owns, and must not set a cookie on everyone
    consumer.apply(CsrfMiddleware).exclude({ path: 'public/collect', method: RequestMethod.POST }).forRoutes('{*splat}');
  }
}
