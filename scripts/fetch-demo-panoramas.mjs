// Demo 360° panoramas: hand-picked equirectangular (2:1) spheres from Wikimedia Commons, author credited.
// Writes media-src/panoramas/*.jpg and media-src/panoramas.json (an import-media manifest that appends to each location).
//
//   node scripts/fetch-demo-panoramas.mjs
//   then: LOCI_PASSWORD=… node scripts/import-media.mjs media-src/panoramas.json
//
// Demo only: the customer replaces these with their own 360° shoots of each location.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', 'media-src');
const UA = 'LOCI360-demo/0.1 (location catalogue demo; contact: scouting@loci360.kz)';

/**
 * Commons spheres near each location, found by geosearch around the pins and by the "сферопанорама" series
 * (Nikolai Bulykin's drone panoramas, 14400 × 7200), then checked by eye: only true 2:1 spheres shot at or
 * next to the place. Commons thumbnails stop at 3840 px, too soft for a sphere, so the originals are downloaded
 * (8–45 MB); the worker scales them to 8192 px.
 */
const PICKS = {
  'almaty-soviet-modernism': [
    ['Алматы, площадь Республики, сферопанорама.jpg', 'Republic Square from above', 'Площадь Республики с высоты'],
    ['Алматы, улица Айтеке би, сферопанорама (2).jpg', 'The Soviet grid of the centre, Aiteke Bi Street', 'Сетка советского центра, улица Айтеке би'],
  ],
  'altyn-emel-singing-dune': [
    ['Кербулакский район, поющий бархан, сферопанорама (3).jpg', 'Over the Singing Dune', 'Над Поющим барханом'],
    ['Кербулакский район, поющий бархан, сферопанорама (2).jpg', 'The dune ridge and the Ili valley', 'Гребень бархана и долина Или'],
  ],
  'assy-plateau': [
    ['Енбекшиказахский район, плато Ассы, сферопанорама.jpg', 'Assy plateau pastures', 'Пастбища плато Ассы'],
    ['Енбекшиказахский район, Ассы-Тургенская обсерватория, сферопанорама.jpg', 'Assy-Turgen observatory', 'Ассы-Тургенская обсерватория'],
  ],
  'big-almaty-lake': [['Orbita - Panorama (Alex Radosnov via Poly Haven).jpg', 'The road to the Orbita observatory above the lake', 'Дорога к обсерватории «Орбита» над озером']],
  'kok-zhailau': [
    ['Алматы, Каменское плато, сферопанорама.jpg', 'Kamenskoe plateau, the trailhead to Kok-Zhailau', 'Каменское плато, начало тропы на Кок-Жайляу'],
    ['Алматы, сады совхоза Алатау, сферопанорама.jpg', 'Foothill orchards below the plateau', 'Сады в предгорьях под плато'],
  ],
  'medeu-skating-rink': [
    ['Алматы, Медео, сферопанорама (1).jpg', 'Medeu gorge in winter', 'Урочище Медеу зимой'],
    ['Алматы, Шымбулак, сферопанорама.jpg', 'Shymbulak ski resort above the rink', 'Курорт Шымбулак над катком'],
  ],
  'kapshagay-ili': [['Конаев, сферопанорама у СЭС.jpg', 'Kapshagay reservoir and the steppe around Konaev', 'Капшагайское водохранилище и степь у Конаева']],
  'khan-shatyr': [['Астана, Малый Талдыколь, сферопанорама.jpg', 'The new Left Bank of Astana from above', 'Новый Левый берег Астаны с высоты']],
  'balkhash-lake': [['Балхаш-9, сферопанорама.jpg', 'Balkhash-9: an abandoned garrison town on the lake shore', 'Балхаш-9: заброшенный военный городок на берегу']],
};

const OK_LICENCE = /^(CC0|CC BY(-SA)? [0-9.]+|Public domain|PD)/i;
const strip = (html = '') => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function info(titles) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({
    action: 'query',
    titles: titles.map((t) => `File:${t}`).join('|'),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiextmetadatafilter: 'LicenseShortName|Artist',
    format: 'json',
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`Commons ${res.status}`);
  const data = await res.json();
  const asked = new Map((data.query?.normalized ?? []).map((n) => [n.to, n.from]));
  const out = new Map();
  for (const p of Object.values(data.query?.pages ?? {})) {
    const i = p.imageinfo?.[0];
    const m = i?.extmetadata ?? {};
    out.set((asked.get(p.title) ?? p.title).replace(/^File:/, ''), i && {
      page: i.descriptionurl,
      orig: i.url,
      width: i.width,
      height: i.height,
      mime: i.mime,
      licence: strip(m.LicenseShortName?.value),
      artist: strip(m.Artist?.value).replace(/\s*\(https?:\/\/\S+\)\s*$/, '') || 'Unknown author',
    });
  }
  return out;
}

async function download(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
  }
  throw new Error(`download failed: ${url}`);
}

async function main() {
  const all = Object.values(PICKS).flat().map(([t]) => t);
  const found = await info(all);
  await mkdir(join(ROOT, 'panoramas'), { recursive: true });

  const items = [];
  for (const [slug, picks] of Object.entries(PICKS)) {
    for (const [title, labelEn, labelRu] of picks) {
      const c = found.get(title);
      if (!c) throw new Error(`${slug}: "${title}" not found on Commons`);
      if (!/jpeg/.test(c.mime) || !OK_LICENCE.test(c.licence)) throw new Error(`${slug}: "${title}" is ${c.mime}, ${c.licence}`);
      if (Math.abs(c.width / c.height - 2) > 0.02) throw new Error(`${slug}: "${title}" is ${c.width}×${c.height}, not 2:1`);
      const file = `panoramas/${slug}-${createHash('sha1').update(title).digest('hex').slice(0, 8)}.jpg`;
      if (!existsSync(join(ROOT, file))) {
        console.log(`↓ ${title}`);
        await writeFile(join(ROOT, file), await download(c.orig));
        await new Promise((r) => setTimeout(r, 1000)); // be polite to Commons
      }
      items.push({
        file,
        kind: 'PANORAMA',
        title: title.replace(/\.jpe?g$/i, ''),
        credit: `${c.artist} / ${c.licence} via Wikimedia Commons`,
        source: c.page,
        location: slug,
        role: 'PANORAMA',
        labelEn,
        labelRu,
      });
    }
    console.log(`✓ ${slug}: ${picks.length} panorama(s)`);
  }
  await writeFile(join(ROOT, 'panoramas.json'), JSON.stringify({ items }, null, 2));
  console.log(`panoramas.json: ${items.length} items`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
