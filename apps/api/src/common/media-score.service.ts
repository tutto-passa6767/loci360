import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RevalidateService } from './revalidate.service';

type Size = { width: number | null; height: number | null } | null | undefined;

/** How sharp a photo can be shown: its short side against 2000 px, capped at 1 */
const sharpness = (a: Size) => (a?.width && a?.height ? Math.min(1, Math.min(a.width, a.height) / 2000) : 0);

/**
 * Catalogue ranking: places with a 360° view come first, then by photo quality — the cover weighs three times
 * (it is what the card and the page header show) plus the sharpness of up to twelve gallery photos.
 * Recomputed after media edits in the CMS and every few minutes (the worker finishes files in the background).
 */
@Injectable()
export class MediaScoreService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('MediaScore');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly revalidate: RevalidateService,
  ) {}

  onApplicationBootstrap() {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), 5 * 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async refresh(ids?: string[]) {
    try {
      const rows = await this.prisma.location.findMany({
        where: ids ? { id: { in: ids } } : {},
        select: {
          id: true,
          hasPanorama: true,
          mediaScore: true,
          cover: { select: { width: true, height: true, state: true } },
          media: { select: { role: true, asset: { select: { width: true, height: true, state: true } } } },
          _count: { select: { panoramaEmbeds: true } },
        },
      });
      let changed = 0;
      for (const r of rows) {
        const ready = r.media.filter((m) => m.asset.state === 'READY');
        const hasPanorama = ready.some((m) => m.role === 'PANORAMA') || r._count.panoramaEmbeds > 0;
        const photos = ready.filter((m) => m.role === 'PHOTO').map((m) => m.asset);
        const cover = r.cover?.state === 'READY' ? r.cover : photos[0];
        const gallery = photos
          .map(sharpness)
          .sort((a, b) => b - a)
          .slice(0, 12)
          .reduce((s, x) => s + x, 0);
        const mediaScore = Math.round((3 * sharpness(cover) + gallery) * 1000) / 1000;
        if (r.hasPanorama === hasPanorama && Math.abs(r.mediaScore - mediaScore) < 0.001) continue;
        await this.prisma.location.update({ where: { id: r.id }, data: { hasPanorama, mediaScore } });
        changed++;
      }
      if (changed) this.revalidate.tags('locations', 'home');
    } catch (e) {
      this.log.warn(`ranking not updated: ${(e as Error).message}`);
    }
  }
}
