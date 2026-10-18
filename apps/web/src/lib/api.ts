import { notFound } from 'next/navigation';
import type {
  CatalogueResult,
  HomeData,
  Lang,
  LocationDetail,
  LocationOption,
  MapPoint,
  PageData,
  ServiceCompany,
  SiteData,
  Taxonomy,
} from './types';

const API = (process.env.API_INTERNAL_URL || 'http://localhost:4360').replace(/\/$/, '');

/** Cache tags — the API names the same ones when it asks to revalidate (apps/api/src/common/revalidate.service.ts) */
export type CacheTag = 'locations' | 'taxonomy' | 'home' | 'pages' | 'services' | 'site';

export class ApiUnavailable extends Error {}

/**
 * Server-side fetch of public data. Responses are cached for 5 minutes and dropped immediately
 * when the CMS changes something with the same tag.
 */
async function get<T>(path: string, tags: CacheTag[], opts: { notFoundOn404?: boolean } = {}): Promise<T> {
  let res: Response | null = null;
  // A dropped keep-alive socket or an API restart is retried twice before the visitor sees the error page
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${API}/api/public${path}`, { next: { revalidate: 300, tags } });
      if (res.status < 500 || attempt === 2) break;
    } catch (e) {
      if (attempt === 2) throw new ApiUnavailable(`API is not reachable: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1) ** 2));
  }
  if (!res) throw new ApiUnavailable(`API ${path} gave no response`);
  if (res.status === 404 && opts.notFoundOn404) notFound();
  if (!res.ok) throw new ApiUnavailable(`API ${path} answered ${res.status}`);
  return (await res.json()) as T;
}

const qs = (params: Record<string, string | number | undefined | null>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
};

export const api = {
  home: (lang: Lang) => get<HomeData>(`/home${qs({ lang })}`, ['home', 'locations', 'taxonomy', 'site']),
  taxonomy: (lang: Lang) => get<Taxonomy>(`/taxonomy${qs({ lang })}`, ['taxonomy', 'locations']),
  locations: (lang: Lang, filters: Record<string, string | undefined>) =>
    get<CatalogueResult>(`/locations${qs({ ...filters, lang })}`, ['locations']),
  map: (lang: Lang, filters: Record<string, string | undefined> = {}) =>
    get<{ points: MapPoint[] }>(`/map${qs({ ...filters, lang })}`, ['locations']),
  location: (lang: Lang, slug: string) => get<LocationDetail>(`/locations/${encodeURIComponent(slug)}${qs({ lang })}`, ['locations'], { notFoundOn404: true }),
  options: (lang: Lang) => get<{ items: LocationOption[] }>(`/location-options${qs({ lang })}`, ['locations']),
  page: (lang: Lang, slug: string) => get<PageData>(`/pages/${slug}${qs({ lang })}`, ['pages'], { notFoundOn404: true }),
  services: (lang: Lang) => get<{ items: ServiceCompany[] }>(`/services${qs({ lang })}`, ['services']),
  site: (lang: Lang) => get<SiteData>(`/site${qs({ lang })}`, ['site']),
  sitemap: () =>
    get<{ locations: { slug: string; updatedAt: string }[]; pages: { slug: string; updatedAt: string }[]; clusters: { slug: string }[] }>(`/sitemap`, [
      'locations',
      'pages',
    ]),
};
