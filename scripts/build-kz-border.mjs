// Kazakhstan's border for the maps: the country polygon from Natural Earth 1:10m (public domain), simplified to
// ~300 m (Douglas–Peucker) and rounded to 4 decimals, written to apps/web/public/geo/kazakhstan.json.
//
//   node scripts/build-kz-border.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson';
const OUT = resolve(import.meta.dirname, '..', 'apps', 'web', 'public', 'geo', 'kazakhstan.json');
const TOLERANCE = 0.003; // degrees
const MIN_AREA = 0.0005; // drop specks (tiny islands) below this many square degrees

/** Perpendicular distance from p to the segment a–b, in degrees */
function distance(p, a, b) {
  const [x, y] = p;
  const [x1, y1] = a;
  const [x2, y2] = b;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (!dx && !dy) return Math.hypot(x - x1, y - y1);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let max = 0;
    let index = 0;
    for (let i = first + 1; i < last; i++) {
      const d = distance(points[i], points[first], points[last]);
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (max > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const area = (ring) => Math.abs(ring.reduce((s, [x1, y1], i) => {
  const [x2, y2] = ring[(i + 1) % ring.length];
  return s + x1 * y2 - x2 * y1;
}, 0)) / 2;
const round = (ring) => ring.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]);

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`Natural Earth ${res.status}`);
const world = await res.json();
const kz = world.features.find((f) => f.properties.ADM0_A3 === 'KAZ');
if (!kz) throw new Error('KAZ not found');
const polygons = kz.geometry.type === 'Polygon' ? [kz.geometry.coordinates] : kz.geometry.coordinates;
const out = polygons
  .filter((poly) => area(poly[0]) >= MIN_AREA)
  .map((poly) => poly.map((ring) => round(simplify(ring, TOLERANCE))).filter((ring) => ring.length >= 4));
const before = polygons.flat().reduce((s, r) => s + r.length, 0);
const after = out.flat().reduce((s, r) => s + r.length, 0);
const feature = {
  type: 'Feature',
  properties: { name: 'Kazakhstan', source: 'Natural Earth 1:10m admin 0 (public domain)' },
  geometry: { type: 'MultiPolygon', coordinates: out },
};
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(feature));
console.log(`${polygons.length} → ${out.length} polygon(s), ${before} → ${after} points, ${(JSON.stringify(feature).length / 1024).toFixed(0)} KB`);
