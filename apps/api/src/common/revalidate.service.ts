import { Injectable, Logger } from '@nestjs/common';
import { cfg } from '../config';

/** Cache tags of the public site (apps/web/src/lib/api.ts uses the same names) */
export type CacheTag = 'locations' | 'taxonomy' | 'home' | 'pages' | 'services' | 'site';

/**
 * After a CMS edit the public pages must show fresh content without waiting for the cache to expire:
 * the API asks the web app to drop the cached data for the affected tags.
 */
@Injectable()
export class RevalidateService {
  private readonly log = new Logger('Revalidate');
  private pending = new Set<CacheTag>();
  private timer: NodeJS.Timeout | null = null;

  /** Edits often come in bursts (saving a location, then its media) — batch them for 300 ms */
  tags(...tags: CacheTag[]) {
    if (!cfg.web.internalUrl || !cfg.web.revalidateSecret) return;
    tags.forEach((t) => this.pending.add(t));
    if (this.timer) return;
    this.timer = setTimeout(() => void this.flush(), 300);
  }

  private async flush() {
    const tags = [...this.pending];
    this.pending.clear();
    this.timer = null;
    try {
      const res = await fetch(`${cfg.web.internalUrl}/hooks/revalidate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-revalidate-secret': cfg.web.revalidateSecret },
        body: JSON.stringify({ tags }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) this.log.warn(`web answered ${res.status} for ${tags.join(', ')}`);
    } catch (e) {
      // The web app may be stopped during development — its cache expires on its own anyway
      this.log.warn(`could not reach web app: ${(e as Error).message}`);
    }
  }
}
