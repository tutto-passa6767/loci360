import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ServiceCategory } from '@loci/db';
import { Public } from '../auth/auth.types';
import { AppError } from '../common/errors';
import { langOf } from '../common/lang';
import { SHORTLIST_MAX, SpecSheetService } from '../pdf/spec-sheet.service';
import { StatsService } from '../common/stats.service';
import { CatalogueQuery, CreateLeadDto, CreateQuestionDto, LangQuery, SubscribeDto, UnsubscribeDto } from './catalogue.dto';
import { NewsletterService } from './newsletter.service';
import { CatalogueService } from './catalogue.service';
import { ContentService } from './content.service';
import { LeadsService } from './leads.service';

class ServicesQuery extends LangQuery {
  @IsOptional()
  @IsEnum(ServiceCategory)
  category?: ServiceCategory;
}

class ShortlistQuery extends LangQuery {
  /** comma-separated location slugs, as in the share link /shortlist?l=… */
  @Matches(new RegExp(`^[a-z0-9-]{1,80}(,[a-z0-9-]{1,80}){0,${SHORTLIST_MAX - 1}}$`))
  l!: string;
}

class CollectDto {
  @IsIn(['view', 'reel', 'panorama', 'shortlist'])
  e!: 'view' | 'reel' | 'panorama' | 'shortlist';

  /** site paths are lowercase slugs: anything else is not ours */
  @Matches(/^\/[a-z0-9/-]{0,160}$/)
  p!: string;

  @IsOptional()
  @Matches(/^[a-z0-9-]{1,80}$/)
  l?: string;

  @IsOptional()
  @IsBoolean()
  v?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  r?: string;
}

const SLUG = /^[a-z0-9-]{1,80}$/;
const slugOrThrow = (slug: string) => {
  if (!SLUG.test(slug)) throw new AppError(404, 'NOT_FOUND', 'Not found');
  return slug;
};

/** Public catalogue for visitors — no sign-in. The web app caches these responses and revalidates on CMS edits. */
@Public()
@Controller('public')
export class PublicController {
  constructor(
    private readonly catalogue: CatalogueService,
    private readonly content: ContentService,
    private readonly leads: LeadsService,
    private readonly specSheets: SpecSheetService,
    private readonly stats: StatsService,
    private readonly newsletter: NewsletterService,
  ) {}

  /** Anonymous counters from the browser (no cookies, nothing stored about the visitor) */
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('collect')
  @HttpCode(204)
  collect(@Body() dto: CollectDto, @Req() req: Request) {
    this.stats.collect(dto, req.headers['user-agent']);
  }

  @Get('home')
  home(@Query() q: LangQuery) {
    return this.catalogue.home(langOf(q.lang));
  }

  @Get('taxonomy')
  taxonomy(@Query() q: LangQuery) {
    return this.catalogue.taxonomy(langOf(q.lang));
  }

  @Get('locations')
  locations(@Query() q: CatalogueQuery) {
    return this.catalogue.list(q, langOf(q.lang));
  }

  @Get('map')
  map(@Query() q: CatalogueQuery) {
    return this.catalogue.mapPoints(q, langOf(q.lang));
  }

  @Get('location-options')
  options(@Query() q: LangQuery) {
    return this.catalogue.options(langOf(q.lang));
  }

  @Get('locations/:slug')
  location(@Param('slug') slug: string, @Query() q: LangQuery) {
    return this.catalogue.detail(slugOrThrow(slug), langOf(q.lang));
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('locations/:slug/spec-sheet.pdf')
  @Header('Cache-Control', 'public, max-age=300')
  async specSheet(@Param('slug') slug: string, @Query() q: LangQuery, @Req() req: Request, @Res() res: Response) {
    const { pdf, filename } = await this.specSheets.render(slugOrThrow(slug), langOf(q.lang));
    if (!this.stats.isBot(req.headers['user-agent'])) this.stats.hit('pdf', slug);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('shortlist.pdf')
  @Header('Cache-Control', 'public, max-age=300')
  async shortlistPdf(@Query() q: ShortlistQuery, @Req() req: Request, @Res() res: Response) {
    const { pdf, filename } = await this.specSheets.renderShortlist(q.l.split(','), langOf(q.lang));
    if (!this.stats.isBot(req.headers['user-agent'])) this.stats.hit('shortlistPdf');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  }

  @Get('pages/:slug')
  page(@Param('slug') slug: string, @Query() q: LangQuery) {
    return this.content.page(slugOrThrow(slug), langOf(q.lang));
  }

  @Get('services')
  services(@Query() q: ServicesQuery) {
    return this.content.services(langOf(q.lang), q.category);
  }

  @Get('site')
  site(@Query() q: LangQuery) {
    return this.content.site(langOf(q.lang));
  }

  @Get('sitemap')
  sitemap() {
    return this.content.sitemap();
  }

  /** Scouting request form */
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  @HttpCode(201)
  @Post('leads')
  createLead(@Body() dto: CreateLeadDto, @Req() req: Request) {
    return this.leads.create(dto, req);
  }

  /** The short "ask the location manager" form */
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  @Post('questions')
  @HttpCode(201)
  ask(@Body() dto: CreateQuestionDto, @Req() req: Request) {
    return this.leads.ask(dto, req);
  }

  /** Newsletter sign-up from the footer */
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  @Post('subscribe')
  @HttpCode(200)
  subscribe(@Body() dto: SubscribeDto, @Req() req: Request) {
    return this.newsletter.subscribe(dto, req);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('unsubscribe')
  @HttpCode(200)
  unsubscribe(@Body() dto: UnsubscribeDto) {
    return this.newsletter.unsubscribe(dto.token);
  }
}
