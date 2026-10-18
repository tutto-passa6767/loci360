// Uploads media through the CMS API exactly like the browser does (multipart, presigned parts),
// then attaches the files to locations, clusters and home-page moods.
//
//   node scripts/import-media.mjs media-src/manifest.json [--replace] [--prune old-manifest.json]
//
//   --replace   each location in the manifest gets exactly the manifest's media (otherwise new files are appended)
//   --prune     deletes the files of an earlier manifest that the new one no longer lists (CMS uploads are untouched)
//
// Manifest: { "items": [ {
//   "file": "charyn-1.jpg",              // relative to the manifest
//   "kind": "PHOTO" | "VIDEO" | "PANORAMA",
//   "title": "Charyn at sunset", "credit": "© Author / CC BY-SA 4.0", "altEn": "...", "altRu": "...",
//   "watermark": true,
//   "location": "charyn-canyon", "role": "PHOTO" | "SHOWREEL" | "BROLL" | "PANORAMA",
//   "timeOfDay": "DAY" | "GOLDEN_HOUR" | "NIGHT", "labelEn": "...", "labelRu": "...",
//   "cover": true,                        // make it the location cover
//   "clusterCover": "almaty",             // make it a cluster cover
//   "hero": "western"                     // use it for a home-page genre mood
// } ] }
//
// Env: LOCI_API (default http://localhost:4360/api), LOCI_EMAIL, LOCI_PASSWORD.
import { readFile, stat } from 'node:fs/promises';
import { open } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

const API = (process.env.LOCI_API ?? 'http://localhost:4360/api').replace(/\/$/, '');
const EMAIL = process.env.LOCI_EMAIL ?? 'admin@loci360.kz';
const PASSWORD = process.env.LOCI_PASSWORD;

let cookies = {};
const cookieHeader = () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
const keepCookies = (res) => {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    cookies[pair.slice(0, i)] = pair.slice(i + 1);
  }
};

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      cookie: cookieHeader(),
      'x-csrf-token': cookies.loci_csrf ?? '',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  keepCookies(res);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data?.code ?? ''} ${data?.message ?? text}`);
  return data;
}

async function upload(path, item) {
  const { size } = await stat(path);
  const start = await api('POST', '/admin/uploads', {
    fileName: basename(path),
    size,
    kind: item.kind,
    watermark: item.watermark,
  });
  const fh = await open(path, 'r');
  try {
    for (let first = 1; first <= start.partsCount; first += 20) {
      const numbers = Array.from({ length: Math.min(20, start.partsCount - first + 1) }, (_, i) => first + i);
      const { urls } = await api('POST', `/admin/uploads/${start.assetId}/parts`, { partNumbers: numbers });
      // Four parts in flight at a time
      for (let i = 0; i < numbers.length; i += 4) {
        await Promise.all(
          numbers.slice(i, i + 4).map(async (n) => {
            const offset = (n - 1) * start.partSize;
            const len = Math.min(start.partSize, size - offset);
            const buf = Buffer.alloc(len);
            await fh.read(buf, 0, len, offset);
            const res = await fetch(urls[n], { method: 'PUT', body: buf });
            if (!res.ok) throw new Error(`part ${n}: ${res.status} ${await res.text()}`);
          }),
        );
      }
      process.stdout.write(`\r  ${basename(path)}: ${Math.min(100, Math.round(((first + numbers.length - 1) / start.partsCount) * 100))}%   `);
    }
  } finally {
    await fh.close();
  }
  process.stdout.write('\n');
  return api('POST', `/admin/uploads/${start.assetId}/complete`);
}

/** The whole media library, page by page */
async function allAssets() {
  const items = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const res = await api('GET', `/admin/assets?limit=200&page=${page}`);
    items.push(...res.items);
    pages = res.pages;
  }
  return items;
}

async function main() {
  const args = process.argv.slice(2);
  const replace = args.includes('--replace');
  const pruneAt = args.indexOf('--prune');
  const prunePath = pruneAt >= 0 ? args[pruneAt + 1] : null;
  const manifestPath = args.find((a, i) => !a.startsWith('--') && (pruneAt < 0 || i !== pruneAt + 1));
  if (!manifestPath || !PASSWORD || (pruneAt >= 0 && !prunePath)) {
    console.error('Usage: LOCI_PASSWORD=... node scripts/import-media.mjs <manifest.json> [--replace] [--prune old-manifest.json]');
    process.exit(1);
  }
  const base = dirname(resolve(manifestPath));
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  await api('GET', '/auth/csrf');
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  if (login.mfaRequired) throw new Error('This account uses 2FA — use an account without it for imports');

  // Skip files already in the library (same original name)
  const byName = new Map((await allAssets()).map((a) => [a.originalName, a]));

  const results = [];
  for (const item of manifest.items) {
    const path = resolve(base, item.file);
    let asset = byName.get(basename(path));
    if (asset) console.log(`= ${item.file} already uploaded`);
    else {
      console.log(`↑ ${item.file}`);
      asset = await upload(path, item);
    }
    await api('PATCH', `/admin/assets/${asset.id}`, {
      title: item.title ?? asset.title,
      credit: item.credit ?? null,
      altEn: item.altEn ?? null,
      altRu: item.altRu ?? null,
    });
    results.push({ ...item, assetId: asset.id });
  }

  // Location media in manifest order; without --replace what was attached before is kept
  const byLocation = new Map();
  for (const r of results.filter((r) => r.location)) {
    if (!byLocation.has(r.location)) byLocation.set(r.location, []);
    byLocation.get(r.location).push(r);
  }
  const locations = await api('GET', '/admin/locations?limit=200');
  for (const [slug, items] of byLocation) {
    const loc = locations.items.find((l) => l.slug === slug);
    if (!loc) {
      console.warn(`! location ${slug} not found`);
      continue;
    }
    const full = replace ? { media: [] } : await api('GET', `/admin/locations/${loc.id}`);
    const current = full.media.map((m) => ({ assetId: m.assetId, role: m.role, timeOfDay: m.timeOfDay, labelEn: m.labelEn, labelRu: m.labelRu }));
    for (const r of items) {
      const entry = { assetId: r.assetId, role: r.role ?? r.kind, timeOfDay: r.timeOfDay ?? null, labelEn: r.labelEn ?? null, labelRu: r.labelRu ?? null };
      const i = current.findIndex((m) => m.assetId === r.assetId);
      if (i >= 0) current[i] = entry;
      else current.push(entry);
    }
    await api('PUT', `/admin/locations/${loc.id}/media`, { items: current });
    const cover = items.find((r) => r.cover);
    if (cover) await api('PATCH', `/admin/locations/${loc.id}`, { coverAssetId: cover.assetId });
    console.log(`✓ ${slug}: ${current.length} media`);
  }

  const clusterCovers = results.filter((r) => r.clusterCover);
  if (clusterCovers.length) {
    const clusters = await api('GET', '/admin/clusters');
    for (const r of clusterCovers) {
      const c = clusters.items.find((x) => x.slug === r.clusterCover);
      if (c) await api('PATCH', `/admin/clusters/${c.id}`, { coverAssetId: r.assetId });
    }
    console.log(`✓ ${clusterCovers.length} cluster cover(s)`);
  }

  const heroes = results.filter((r) => r.hero);
  if (heroes.length) {
    const hero = await api('GET', '/admin/hero');
    const items = hero.items.map((h) => {
      const r = heroes.find((x) => x.hero === h.key);
      return {
        key: h.key,
        labelEn: h.labelEn,
        labelRu: h.labelRu,
        assetId: r?.assetId ?? h.assetId,
        genreSlug: h.genreSlug,
        // "Now showing" links to the place the reel was shot at
        locationSlug: r?.location ?? h.locationSlug,
        active: h.active,
      };
    });
    await api('PUT', '/admin/hero', { items });
    console.log(`✓ ${heroes.length} hero mood(s)`);
  }

  if (prunePath) {
    const keep = new Set(manifest.items.map((i) => basename(i.file)));
    const old = new Set(JSON.parse(await readFile(prunePath, 'utf8')).items.map((i) => basename(i.file)).filter((n) => !keep.has(n)));
    const gone = (await allAssets()).filter((a) => old.has(a.originalName));
    for (const a of gone) await api('DELETE', `/admin/assets/${a.id}`);
    console.log(`✓ ${gone.length} file(s) of the old manifest deleted`);
  }
  console.log('done — the worker processes the files in the background');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
