/** Public origin of the site (canonical URLs, sitemap, Open Graph) */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3360').replace(/\/$/, '');

/** Dark vector map style. OpenFreeMap is free for commercial use and needs no key. */
export const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/dark';

/** Kazakhstan bounds for the initial map view */
export const KZ_BOUNDS: [[number, number], [number, number]] = [
  [46.4, 40.5],
  [87.4, 55.5],
];
