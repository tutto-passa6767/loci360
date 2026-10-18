// Real footage for the demo where free video exists: NASA launch footage from Baikonur (public domain), the Baikonur
// rocket railway (Roscosmos TV, CC BY 3.0) and the Google Earth timelapse of the shrinking Aral Sea (CC BY 3.0).
// Downloads from Wikimedia Commons, cuts the usable part with FFmpeg inside the worker image and writes
// media-src/videos.json, which scripts/make-demo-reels.mjs merges into the manifest (a real showreel replaces the
// photo-based demo reel of that location).
//
//   node scripts/fetch-demo-videos.mjs
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', 'media-src');
const IMAGE = process.env.WORKER_IMAGE ?? 'loci360-worker';
const UA = 'LOCI360-demo/0.1 (location catalogue demo; contact: scouting@loci360.kz)';

/** Commons file, the part to keep (seconds) and where it goes */
const CLIPS = [
  {
    title: 'Soyuz TMA-20M launch replay. Expedition 47 crew to the ISS.webm',
    from: 0,
    to: 22,
    file: 'videos/baikonur-soyuz-launch.mp4',
    location: 'baikonur',
    role: 'SHOWREEL',
    labelEn: 'Night launch',
    labelRu: 'Ночной пуск',
  },
  {
    title: 'Baikonur Cosmodrome Railway.webm',
    from: 40,
    to: 53,
    file: 'videos/baikonur-rocket-railway.mp4',
    location: 'baikonur',
    role: 'BROLL',
    labelEn: 'Rocket by rail',
    labelRu: 'Ракета на тепловозе',
  },
  {
    title: 'Aral Sea Kazakhstan Uzbekistan Google Earth Timelapse 1984-2018.webm',
    from: 0,
    to: 37,
    file: 'videos/aral-sea-timelapse.mp4',
    location: 'aral-ship-graveyard',
    role: 'BROLL',
    labelEn: 'The sea retreats, 1984–2018',
    labelRu: 'Как уходило море, 1984–2018',
  },
];

const strip = (html = '') => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function ffmpeg(args) {
  return new Promise((res, rej) => {
    const p = spawn('docker', ['run', '--rm', '-v', `${ROOT}:/m`, '--entrypoint', 'ffmpeg', IMAGE, ...args], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, MSYS_NO_PATHCONV: '1' },
    });
    p.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`))));
  });
}

async function main() {
  await mkdir(join(ROOT, 'videos'), { recursive: true });
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({
    action: 'query',
    format: 'json',
    titles: CLIPS.map((c) => `File:${c.title}`).join('|'),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiextmetadatafilter: 'Artist|LicenseShortName',
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  const data = await (await fetch(url, { headers: { 'user-agent': UA } })).json();
  const info = new Map(Object.values(data.query.pages).map((p) => [p.title.replace(/^File:/, ''), p.imageinfo?.[0]]));

  const items = [];
  for (const c of CLIPS) {
    const i = info.get(c.title);
    if (!i) throw new Error(`"${c.title}" not found on Commons`);
    const credit = `${strip(i.extmetadata?.Artist?.value) || 'Unknown author'} / ${strip(i.extmetadata?.LicenseShortName?.value)} via Wikimedia Commons`;
    if (!existsSync(join(ROOT, c.file))) {
      const src = `videos/src-${c.file.split('/').pop().replace('.mp4', '.webm')}`;
      if (!existsSync(join(ROOT, src))) {
        console.log(`↓ ${c.title}`);
        await writeFile(join(ROOT, src), Buffer.from(await (await fetch(i.url, { headers: { 'user-agent': UA } })).arrayBuffer()));
      }
      // Keep the usable part at its native resolution (up to 4K); the worker builds the HLS ladder from it
      await ffmpeg([
        '-hide_banner', '-loglevel', 'error', '-y',
        '-ss', String(c.from), '-to', String(c.to), '-i', `/m/${src}`,
        '-an', '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-movflags', '+faststart',
        `/m/${c.file}`,
      ]);
      console.log(`✓ ${c.file}`);
    }
    items.push({
      file: c.file,
      kind: 'VIDEO',
      title: c.title.replace(/\.(webm|ogv)$/i, ''),
      credit,
      source: i.descriptionurl ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(c.title)}`,
      location: c.location,
      role: c.role,
      labelEn: c.labelEn,
      labelRu: c.labelRu,
      watermark: true,
    });
  }
  await writeFile(join(ROOT, 'videos.json'), JSON.stringify({ items }, null, 2));
  console.log(`videos.json: ${items.length} clips`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
