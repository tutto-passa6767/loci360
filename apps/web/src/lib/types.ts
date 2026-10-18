// Shapes of the public API responses (apps/api/src/public, apps/api/src/common/media.presenter.ts)

export type Lang = 'en' | 'ru';
export type Season = 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER';
export type HeavyAccess = 'FULL' | 'LIMITED' | 'OFFROAD' | 'NONE';
export type Connectivity = 'NONE' | 'G2' | 'G3' | 'G4' | 'G5';
export type PowerSupply = 'GRID' | 'NEARBY' | 'GENERATOR';
export type DroneRule = 'ALLOWED' | 'PERMIT' | 'RESTRICTED';
export type TimeOfDay = 'DAY' | 'GOLDEN_HOUR' | 'NIGHT';
export type ProjectType = 'FEATURE' | 'SERIES' | 'COMMERCIAL' | 'MUSIC_VIDEO' | 'DOCUMENTARY' | 'OTHER';
export type BudgetRange = 'UNDER_500K' | 'FROM_500K_TO_2M' | 'FROM_2M_TO_10M' | 'OVER_10M' | 'UNDISCLOSED';
export type ServiceCategory = 'PRODUCTION_SERVICES' | 'RENTAL' | 'CATERING' | 'CAST' | 'TRANSPORT' | 'ACCOMMODATION';

export interface PublicImage {
  src: string;
  srcSet: string;
  width: number;
  height: number;
  blur: string | null;
  color: string | null;
  alt: string;
  credit: string | null;
}

export interface PublicVideo {
  id: string;
  hls: string;
  poster: PublicImage;
  loop: string | null;
  preview: string | null;
  sprite: { url: string; interval: number; cols: number; rows: number; tileW: number; tileH: number; count: number } | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  qualities: number[];
  credit: string | null;
  label?: string | null;
}

export interface ClimateMonth {
  tmax: number;
  tmin: number;
  precip: number;
  rainDays: number;
  sunHours: number;
  snowCm: number;
}

export interface ClimateMonthly {
  months: ClimateMonth[];
  period: string;
  source: string;
}

export interface PanoramaEmbed {
  id: string;
  src: string;
  provider: string;
  label: string | null;
  credit: string | null;
}

export interface PublicPanorama {
  id: string;
  sources: { url: string; width: number; height: number }[];
  preview: PublicImage;
  credit: string | null;
  label: string | null;
}

export interface TermLabel {
  slug: string;
  label: string;
}

export interface LocationCard {
  id: string;
  slug: string;
  name: string;
  summary: string;
  region: string | null;
  cluster: { slug: string; name: string } | null;
  lat: number;
  lng: number;
  elevationM: number | null;
  airportCode: string | null;
  airportKm: number | null;
  driveHours: number | null;
  heavyAccess: HeavyAccess;
  seasons: Season[];
  genres: TermLabel[];
  landscapes: TermLabel[];
  cover: PublicImage | null;
  preview: string | null;
  hasVideo: boolean;
  hasPanorama: boolean;
  featured: boolean;
}

export interface CatalogueResult {
  items: LocationCard[];
  total: number;
  page: number;
  pages: number;
}

export interface MapPoint {
  slug: string;
  name: string;
  summary: string;
  region: string | null;
  lat: number;
  lng: number;
  featured: boolean;
  cluster: string | null;
  thumb: string | null;
  genres: string[];
}

export interface Taxonomy {
  genres: (TermLabel & { count: number })[];
  landscapes: (TermLabel & { count: number })[];
  eras: (TermLabel & { count: number })[];
  tags: (TermLabel & { count: number })[];
  clusters: { slug: string; name: string; tagline: string; count: number }[];
  seasons: { value: Season; count: number }[];
  access: { value: HeavyAccess; count: number }[];
}

export interface LocationDetail {
  id: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  region: string | null;
  cluster: { slug: string; name: string; tagline: string } | null;
  genres: TermLabel[];
  landscapes: TermLabel[];
  eras: TermLabel[];
  tags: TermLabel[];
  cover: PublicImage | null;
  reels: PublicVideo[];
  broll: PublicVideo[];
  photos: (PublicImage & { id: string; timeOfDay: TimeOfDay | null; label: string | null })[];
  panoramas: PublicPanorama[];
  /** hosted 360° views (licensed embed codes from panorama services) */
  panoramaEmbeds: PanoramaEmbed[];
  /** monthly weather normals; null until the API has computed them */
  climate: ClimateMonthly | null;
  spec: {
    lat: number;
    lng: number;
    elevationM: number | null;
    airport: { code: string | null; name: string | null; km: number | null } | null;
    driveHours: number | null;
    rail: { name: string; km: number | null } | null;
    town: { name: string; km: number | null } | null;
    heavyAccess: HeavyAccess;
    accessNotes: string | null;
    connectivity: Connectivity;
    power: PowerSupply;
    hotels: string | null;
    hotelKm: number | null;
    nationalPark: boolean;
    borderZone: boolean;
    drone: DroneRule;
    permitNotes: string | null;
    seasons: Season[];
    climate: string | null;
  };
  seo: { title: string; description: string | null; image: { url: string; width: number; height: number } | null };
  related: LocationCard[];
  updatedAt: string;
}

export interface HomeData {
  hero: {
    key: string;
    label: string;
    genreSlug: string | null;
    video: PublicVideo | null;
    location: { slug: string; name: string; region: string | null } | null;
  }[];
  clusters: {
    slug: string;
    name: string;
    tagline: string;
    description: string | null;
    cover: PublicImage | null;
    count: number;
    lat: number;
    lng: number;
    zoom: number;
  }[];
  featured: LocationCard[];
  tags: TermLabel[];
  highlights: { value: string; label: string }[];
  stats: { locations: number; clusters: number };
}

export interface PageData {
  slug: string;
  title: string;
  lead: string;
  body: string;
  seo: { title: string; description: string | null; image: { url: string; width: number; height: number } | null };
  updatedAt: string;
}

export interface ServiceCompany {
  id: string;
  name: string;
  category: ServiceCategory;
  city: string;
  description: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  logo: string | null;
}

export interface SiteData {
  contacts: { organisation: string; email: string; phone: string; address: string; website: string };
  social: { instagram: string; youtube: string; vimeo: string; linkedin: string };
  seo: { title: string; description: string; image: { url: string; width: number; height: number } | null };
  /** The person producers talk to; without a name the office is shown */
  manager?: { name: string | null; role: string | null; photo: PublicImage | null; phone: string | null; whatsapp: string | null; telegram: string | null; email: string | null };
  process?: { title: string; text: string; duration: string }[];
  faq?: { q: string; a: string }[];
  /** GA4 / Yandex Metrica IDs from the CMS; null = not used */
  analytics?: { ga4Id: string | null; metrikaId: string | null };
}

export interface LocationOption {
  slug: string;
  name: string;
  region: string | null;
  cluster: string | null;
}
