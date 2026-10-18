// Turns the Commons photos (media-src/photos.json) into demo showreels at 1080p — slow camera moves (Ken Burns) with
// cross-fades — plus a second colour grade for the four home-page moods, then writes media-src/manifest.json.
// Runs FFmpeg inside the worker image, so nothing has to be installed on the host.
//
//   node scripts/make-demo-reels.mjs
//
// Nothing repeats on the site: a reel is cut from photos that are then left out of the gallery, the cover is shown
// only in the page header (the API keeps it out of the gallery), and every cluster card gets its own photo that no
// location shows. Real footage from media-src/videos.json (scripts/fetch-demo-videos.mjs) replaces a demo reel.
//
// These clips only demonstrate the player, the grade switch and the hero — the customer supplies real 4K footage.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', 'media-src');
const IMAGE = process.env.WORKER_IMAGE ?? 'loci360-worker';
const require = createRequire(import.meta.url);
const { locations } = require('../packages/db/prisma/seed-data');

/** Home-page moods and the extra grade each one gets; `from` names the photo the reel opens on */
const HERO = {
  western: { location: 'charyn-canyon', grade: { en: 'Teal & orange', ru: 'Teal & orange', filter: 'colorbalance=rs=-0.08:gs=0.02:bs=0.12:rh=0.12:gh=0.03:bh=-0.10,eq=contrast=1.08:saturation=1.15' } },
  'sci-fi': { location: 'bozzhyra', grade: { en: 'Bleach bypass', ru: 'Bleach bypass', filter: 'eq=saturation=0.35:contrast=1.25:brightness=-0.02,colorbalance=bs=0.06:bm=0.04' } },
  'modern-city': { location: 'astana', broll: false, grade: { en: 'Night city', ru: 'Ночной город', filter: 'eq=brightness=-0.18:contrast=1.2:saturation=1.3,colorbalance=bs=0.25:bm=0.15:rh=0.05' } },
  fantasy: { location: 'kolsai-lakes', grade: { en: 'Misty dawn', ru: 'Туманный рассвет', filter: 'eq=contrast=0.85:saturation=0.75:brightness=0.04:gamma=1.1,colorbalance=bs=0.08:bm=0.05' } },
};

/** Cluster cards: which location lends a photo (by default the cluster's place with the most photos) */
const CLUSTER_SOURCE = { mangystau: 'bozzhyra', saryarka: 'bayanaul', west: 'atyrau-ural-river', south: 'turkestan-yasawi', astana: 'burabay' };

/** Places shown only through their photos: a demo reel would take a photo out of a small set of the team's shots */
const NO_REEL = new Set();

/** Photos a reel is cut from, by file name, where the automatic choice would take a small or key photo */
const REEL_FROM = {
  'kurmangazy-delta': ['kurmangazy-delta-red-dune.jpg', 'kurmangazy-delta-dune-dusk.jpg'],
  // horses on the white seabed and the old shoreline cliffs
  'aral-ship-graveyard': ['aral-ship-graveyard-3ecd23a6.jpg', 'aral-ship-graveyard-0f413f00.jpg'],
  // the home "Modern City" mood: the night skyline, then tilts up Baiterek and the LRT towers
  astana: ['astana-night-skyline-khan-shatyr.jpg', 'astana-baiterek-sunset.jpg', 'astana-lrt-towers.jpg'],
};

/** Camera moves; the frame is first cropped to 16:9 at 4K so the move stays sharp */
const MOVES = [
  "zoompan=z='1+0.14*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=25",
  "zoompan=z='1.14':x='(iw-iw/zoom)*on/{n}':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=25",
  "zoompan=z='1.14-0.12*on/{n}':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*0.4':d=1:s=1920x1080:fps=25",
  "zoompan=z='1.14':x='(iw-iw/zoom)*(1-on/{n})':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=25",
];

/** Width and height from a JPEG's SOF marker */
async function jpegSize(path) {
  const fh = await open(path, 'r');
  try {
    const { buffer } = await fh.read(Buffer.alloc(256 * 1024), 0, 256 * 1024, 0);
    let i = 2;
    while (i < buffer.length - 9) {
      if (buffer[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buffer[i + 1];
      const len = buffer.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: buffer.readUInt16BE(i + 7), h: buffer.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  } finally {
    await fh.close();
  }
  return { w: 16, h: 9 };
}

/** One clip from 1–3 photos ({ file, ratio }): wide shots get a camera move, portrait shots a tilt from bottom to top */
function ffmpeg(inputs, output, grade, moveIndex) {
  const seg = inputs.length === 1 ? 12 : 7;
  const frames = seg * 25;
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  for (const p of inputs) args.push('-loop', '1', '-framerate', '25', '-t', String(seg), '-i', `/m/${p.file}`);
  const parts = inputs.map((p, k) =>
    p.ratio < 1.1
      ? `[${k}:v]scale=3840:-2,crop=3840:2160:0:'(ih-oh)*(1-t/${seg})',scale=1920:1080,fps=25,format=yuv420p,setsar=1,settb=AVTB[v${k}]`
      : `[${k}:v]scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,${MOVES[(moveIndex + k) % MOVES.length].replaceAll('{n}', String(frames))},fps=25,format=yuv420p,setsar=1,settb=AVTB[v${k}]`,
  );
  let last = 'v0';
  for (let k = 1; k < inputs.length; k++) {
    parts.push(`[${last}][v${k}]xfade=transition=fade:duration=1:offset=${k * (seg - 1)}[x${k}]`);
    last = `x${k}`;
  }
  parts.push(`[${last}]${grade ? `${grade},` : ''}format=yuv420p[out]`);
  const total = seg * inputs.length - (inputs.length - 1);
  args.push('-filter_complex', parts.join(';'), '-map', '[out]', '-t', String(total), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-movflags', '+faststart', `/m/${output}`);
  return args;
}

function run(args) {
  return new Promise((resolveRun, reject) => {
    const p = spawn('docker', ['run', '--rm', '-v', `${ROOT}:/m`, '--entrypoint', 'ffmpeg', IMAGE, ...args], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, MSYS_NO_PATHCONV: '1' },
    });
    p.on('close', (code) => (code === 0 ? resolveRun() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

const authors = (list) => [...new Set(list.map((p) => p.credit))].join('; ');
const clipName = (slug, list, suffix) => `reels/${slug}-${createHash('sha1').update(list.map((p) => (p.ratio < 1.1 ? `${p.file}#tilt` : p.file)).join('|')).digest('hex').slice(0, 8)}-${suffix}.mp4`;

async function main() {
  const photos = JSON.parse(await readFile(join(ROOT, 'photos.json'), 'utf8')).items;
  const real = existsSync(join(ROOT, 'videos.json')) ? JSON.parse(await readFile(join(ROOT, 'videos.json'), 'utf8')).items : [];
  for (const p of photos) {
    const { w, h } = await jpegSize(join(ROOT, p.file));
    p.ratio = w / h;
  }
  const bySlug = new Map();
  for (const p of photos) {
    if (!bySlug.has(p.location)) bySlug.set(p.location, []);
    bySlug.get(p.location).push(p);
  }
  const clusterOf = new Map(locations.map((l) => [l.slug, l.cluster]));
  const heroKeyOf = (slug) => Object.entries(HERO).find(([, h]) => h.location === slug)?.[0];

  /** Photos that leave the gallery: used inside a clip or on a cluster card */
  const reserved = new Set();
  const pick = (list, k, { fromEnd = true, wide = 1.3 } = {}) => {
    const pool = list.slice(1).filter((p) => !reserved.has(p));
    const order = fromEnd ? [...pool].reverse() : pool;
    const out = [...order.filter((p) => p.ratio >= wide), ...order.filter((p) => p.ratio < wide)].slice(0, k);
    out.forEach((p) => reserved.add(p));
    return out;
  };

  // Cluster cards first: the best wide photo after the cover of the cluster's richest place (not a hero place unless named)
  const clusterCovers = new Map();
  for (const cluster of new Set(locations.map((l) => l.cluster))) {
    const slug =
      CLUSTER_SOURCE[cluster] ??
      [...bySlug.keys()].filter((s) => clusterOf.get(s) === cluster && !heroKeyOf(s)).sort((a, b) => bySlug.get(b).length - bySlug.get(a).length)[0];
    if (!slug) continue;
    const [photo] = pick(bySlug.get(slug), 1, { fromEnd: false, wide: 1.4 });
    if (photo) clusterCovers.set(photo, cluster);
    console.log(`cluster ${cluster}: ${photo?.title} (from ${slug})`);
  }

  const jobs = [];
  const clips = [];
  let i = 0;
  for (const [slug, list] of bySlug) {
    const heroKey = heroKeyOf(slug);
    const move = i++;
    if (real.some((v) => v.location === slug && v.role === 'SHOWREEL') || NO_REEL.has(slug)) continue;
    const n = list.length;
    // Featured places open on their hero photo; everyone else on wide shots from the end of the set
    const forced = HERO[heroKey]?.from ? list.find((p) => p.title === HERO[heroKey].from) : null;
    if (forced) reserved.add(forced);
    const named = (REEL_FROM[slug] ?? []).map((name) => list.find((p) => p.file.endsWith(`/${name}`))).filter(Boolean);
    named.forEach((p) => reserved.add(p));
    const sources = named.length ? named : [...(forced ? [forced] : []), ...pick(list, (n >= 6 ? 2 : 1) - (forced ? 1 : 0))];
    if (!sources.length) sources.push(list[0]); // a single photo: the reel has to reuse the cover
    const file = clipName(slug, sources, 'reel');
    jobs.push({ file, args: ffmpeg(sources, file, '', move) });
    const credit = `Demo reel from photos by ${authors(sources)}`;
    clips.push({ file, kind: 'VIDEO', title: `${slug} — demo reel`, credit, location: slug, role: 'SHOWREEL', labelEn: heroKey ? 'Natural' : null, labelRu: heroKey ? 'Естественный' : null, watermark: true, ...(heroKey ? { hero: heroKey } : {}) });
    if (heroKey) {
      const g = HERO[heroKey].grade;
      const graded = clipName(slug, sources, 'graded');
      jobs.push({ file: graded, args: ffmpeg(sources, graded, g.filter, move) });
      clips.push({ file: graded, kind: 'VIDEO', title: `${slug} — demo reel (${g.en})`, credit, location: slug, role: 'SHOWREEL', labelEn: g.en, labelRu: g.ru, watermark: true });
      const [second] = HERO[heroKey].broll === false ? [] : pick(list, 1);
      if (second) {
        const broll = clipName(slug, [second], 'broll');
        jobs.push({ file: broll, args: ffmpeg([second], broll, '', move + 1) });
        clips.push({ file: broll, kind: 'VIDEO', title: `${slug} — demo B-roll`, credit: `Demo clip from a photo by ${second.credit}`, location: slug, role: 'BROLL', labelEn: 'Wide', labelRu: 'Общий план', watermark: true });
      }
    }
  }

  // Two encodes at a time
  await mkdir(join(ROOT, 'reels'), { recursive: true });
  const todo = jobs.filter((j) => !existsSync(join(ROOT, j.file)));
  console.log(`${todo.length} clip(s) to render, ${jobs.length - todo.length} already on disk`);
  let done = 0;
  const worker = async () => {
    while (todo.length) {
      const j = todo.shift();
      const t = Date.now();
      await run(j.args);
      console.log(`✓ ${j.file} (${Math.round((Date.now() - t) / 1000)} s, ${++done}/${jobs.length})`);
    }
  };
  await Promise.all([worker(), worker()]);

  const clean = ({ ratio, ...p }) => p; // eslint-disable-line no-unused-vars
  const items = [
    // Gallery photos (the cover stays attached: header, cards, PDF and Open Graph use it)
    ...photos.filter((p) => !reserved.has(p)).map(clean),
    // Cluster-card photos are uploaded but attached to no location
    ...[...clusterCovers].map(([p, cluster]) => {
      const { location, role, timeOfDay, cover, ...rest } = clean(p); // eslint-disable-line no-unused-vars
      return { ...rest, clusterCover: cluster };
    }),
    ...clips,
    ...real,
  ];
  await writeFile(join(ROOT, 'manifest.json'), JSON.stringify({ items }, null, 2));
  const inClips = [...reserved].filter((p) => !clusterCovers.has(p)).length;
  console.log(`manifest.json: ${photos.length - reserved.size} gallery photos, ${clusterCovers.size} cluster photos, ${inClips} photos only inside clips, ${clips.length} demo clips, ${real.length} real clips`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
