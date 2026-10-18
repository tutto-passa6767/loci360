import type { MetadataRoute } from 'next';
import { api } from '@/lib/api';
import { href } from '@/lib/i18n';
import { SITE_URL } from '@/lib/site';
import type { Lang } from '@/lib/types';

// Built per request (cached data) so the build never depends on a running API
export const dynamic = 'force-dynamic';

const STATIC = ['/', '/locations', '/request', '/services'];
const PAGE_PATHS: Record<string, string> = { 'why-kazakhstan': '/why-kazakhstan', incentives: '/incentives', permits: '/permits', privacy: '/privacy' };

const entry = (path: string, lastModified?: string, priority = 0.6): MetadataRoute.Sitemap[number] => ({
  url: `${SITE_URL}${href('en', path)}`,
  lastModified,
  priority,
  alternates: { languages: Object.fromEntries((['en', 'ru'] as Lang[]).map((l) => [l, `${SITE_URL}${href(l, path)}`])) },
});

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await api.sitemap().catch(() => ({ locations: [], pages: [], clusters: [] }));
  return [
    ...STATIC.map((p) => entry(p, undefined, p === '/' ? 1 : 0.8)),
    ...data.pages.filter((p) => PAGE_PATHS[p.slug]).map((p) => entry(PAGE_PATHS[p.slug], p.updatedAt, 0.5)),
    ...data.locations.map((l) => entry(`/locations/${l.slug}`, l.updatedAt, 0.9)),
  ];
}
