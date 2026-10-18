import type { Map as MlMap } from 'maplibre-gl';

type Ring = GeoJSON.Position[];

/** Kazakhstan outline: Natural Earth 1:10m, public domain (scripts/build-kz-border.mjs builds the file) */
let outline: Promise<GeoJSON.Feature<GeoJSON.MultiPolygon>> | null = null;
const load = () => (outline ??= fetch('/geo/kazakhstan.json').then((r) => r.json()));

const signedArea = (ring: Ring) => ring.reduce((s, [x1, y1], i) => s + x1 * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * y1, 0) / 2;

/**
 * Highlights the country: the rest of the world is dimmed and the border is drawn in brand crimson with a soft glow.
 * Added before the location layers, so pins and clusters stay on top.
 */
export async function addKazakhstanBorder(map: MlMap, { mask = true }: { mask?: boolean } = {}) {
  const kz = await load();
  if (!map.getStyle() || map.getSource('kz')) return;
  map.addSource('kz', { type: 'geojson', data: kz });

  if (mask) {
    // A world-sized polygon with the country cut out; MapLibre tells holes by winding, so they run against the outer ring
    const world: Ring = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
    const sign = Math.sign(signedArea(world));
    const holes = kz.geometry.coordinates.map(([outer]: Ring[]) => (Math.sign(signedArea(outer)) === sign ? [...outer].reverse() : outer));
    map.addSource('kz-mask', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [world, ...holes] } } });
    map.addLayer({ id: 'kz-mask', type: 'fill', source: 'kz-mask', paint: { 'fill-color': '#000000', 'fill-opacity': 0.68 } });
    // A faint warm wash inside the border, so the country reads as the lit stage
    map.addLayer({ id: 'kz-fill', type: 'fill', source: 'kz', paint: { 'fill-color': '#e61e32', 'fill-opacity': 0.05 } });
  }
  map.addLayer({
    id: 'kz-glow',
    type: 'line',
    source: 'kz',
    layout: { 'line-join': 'round' },
    paint: { 'line-color': '#e61e32', 'line-opacity': 0.35, 'line-blur': 6, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 6, 8, 14] },
  });
  map.addLayer({
    id: 'kz-border',
    type: 'line',
    source: 'kz',
    layout: { 'line-join': 'round' },
    paint: { 'line-color': '#ff3b4e', 'line-opacity': 0.9, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.2, 8, 2.4] },
  });
}
