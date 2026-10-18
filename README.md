# LOCI360

B2B catalogue and geo-navigator of film locations in Kazakhstan for international producers: 4K showreels, location spec sheets (PDF), an interactive map and a scouting request form with a CRM-lite behind it. English is the primary language, Russian the second one.

## What is inside

| Part | Path | Stack |
| --- | --- | --- |
| Public site + CMS | `apps/web` | Next.js 16 (App Router), Tailwind 4, MapLibre GL + OpenFreeMap, hls.js, three.js |
| API | `apps/api` | NestJS 11, Prisma, PDFKit |
| Media worker | `apps/worker` | Node + FFmpeg + libvips in Docker |
| Database schema, seed | `packages/db` | PostgreSQL 16, Prisma 6 |
| Local infrastructure | `docker-compose.yml` | PostgreSQL, MinIO (S3), Mailpit |

### Public site

- **Home**: full-screen muted video with genre moods (Western / Sci-Fi / Modern City / Fantasy), search with quick tags, map of every location, cluster showcase (Almaty — Alpine & Canyon, Mangystau — Desert & Sci-Fi, Astana — Futuristic & Cyberpunk), "Why film in Kazakhstan" figures, call to action.
- **Directory** `/locations`: grid, list and map views; filters by genre, landscape & architecture, era, cluster, season, heavy-equipment access, distance from an airport and drone rules; sorting; everything lives in the URL.
- **Location page** `/locations/:slug`: HLS player with 4K / 1080p / 720p switching and grade variants of the same reel, B-roll, photos grouped Day / Golden hour / Night with a lightbox, VR 360° viewer, the technical spec sheet, a map, related locations, *Download PDF spec sheet* and *Request this location*.
- **Scouting request** `/request`: name, company, country, project type, budget, dates, multi-select of locations; confirmation email to the producer and a notification to the location team.
- **Content pages**: Why Kazakhstan, Cash rebate & state support, Permits, Privacy — edited in the CMS (Markdown); service-company registry `/services`.
- SEO: per-page titles and descriptions, Open Graph images, `hreflang` alternates, `sitemap.xml`, `robots.txt`, JSON-LD for locations.

### CMS (`/admin`, in Russian)

Dashboard, scouting requests (statuses, owner, notes, CSV export), locations (bilingual fields, terms, map picker for coordinates, spec sheet, media roles, SEO), media library (multipart uploads straight to storage with resume, processing status), genres & clusters, home-page moods and figures, pages, service companies, settings (contacts, who gets requests, default SEO, social links), team and roles, 2FA, activity log.

### Media pipeline

Masters go from the browser to the private `loci-originals` bucket in parts (presigned URLs). The worker claims jobs from the `Asset` table (`FOR UPDATE SKIP LOCKED` — no Redis) and writes to the public `loci-media` bucket under `a/{id}/{rev}/`, so a CDN can cache everything forever:

- video: HLS fMP4 ladder 2160 / 1080 / 720 / 480 (never above the source) with the LOCI360 watermark, seek sprite, 6-second hover clip, 15-second 1080p hero loop, poster stills;
- photo: WebP 480 / 960 / 1600 / 2560, a print JPEG for PDFs, a 1200×630 Open Graph crop, blurred placeholder;
- 360° panorama: equirectangular JPEG 4096 and 8192 px plus 16:9 previews.

## Run locally

Requirements: Node 22+, Docker. Ports are chosen not to clash with other projects: web 3360, API 4360, PostgreSQL 54360, MinIO 59360/59361, Mailpit 51360 (UI on 58360).

**One command:** `npm start`, or double-click `start.cmd` on Windows (it also opens the site in the browser). It:

- starts Docker Desktop if it is off and waits for it;
- installs dependencies when `package-lock.json` changed (e.g. after `git pull`);
- on the first run creates `.env` with random secrets, seeds the demo data and creates the CMS admin `admin@loci360.kz` (the password is printed and appended to `.env`);
- brings up PostgreSQL, MinIO, Mailpit and the media worker, applies migrations;
- runs the API and the site and restarts either one when it crashes or stops answering (three failed health checks, 30 s apart).

`npm run stop` stops the servers and the containers; the data stays in Docker volumes.

The same steps by hand:

```bash
npm install
npm run env:init          # .env with random secrets
npm run infra:up          # PostgreSQL, MinIO, Mailpit
npm run db:deploy         # migrations
npm run db:seed           # taxonomy, clusters, demo locations, pages
npm run admin:create -- admin@loci360.kz "Admin" "a-long-password" ADMIN
npm run worker:up         # media worker (Docker)
npm run dev:api           # http://localhost:4360/api
npm run dev:web           # http://localhost:3360, CMS at /admin
```

Everything in Docker instead: `docker compose --profile app up -d --build`.

### Demo media

`media-src/` is not in git. To fill the demo with free-licence photos from Wikimedia Commons (hand-picked per location in `scripts/fetch-demo-media.mjs`, authors are credited on the site), the few real clips that exist (Baikonur launch and rocket railway, Aral Sea timelapse) and demo reels made from the photos:

```bash
node scripts/fetch-demo-media.mjs
node scripts/fetch-demo-videos.mjs
node scripts/make-demo-reels.mjs
LOCI_PASSWORD=... node scripts/import-media.mjs media-src/manifest.json --replace
```

Nothing repeats on the site: a demo reel is cut from 1–3 photos that are then left out of the gallery, the cover appears only in the page header, and every cluster card has a photo of its own (`make-demo-reels.mjs` decides, an e2e test checks).

After changing the picks, keep a copy of the old `media-src/manifest.json` and add `--prune old-manifest.json` to delete the files that are no longer used.

360° panoramas (equirectangular 2:1 spheres from Commons, mostly Nikolai Bulykin's drone panoramas) are a separate set that is appended to the locations, so run it after the photos:

```bash
node scripts/fetch-demo-panoramas.mjs
LOCI_PASSWORD=... node scripts/import-media.mjs media-src/panoramas.json
```

`scripts/import-media.mjs` uploads any folder of files through the CMS API with the same manifest format — useful for the customer's real masters.

The maps highlight Kazakhstan with `apps/web/public/geo/kazakhstan.json` (Natural Earth 1:10m, public domain, simplified); `node scripts/build-kz-border.mjs` rebuilds it.

## Production notes

- Put a CDN (Cloudflare / CloudFront) in front of the `loci-media` bucket and set `MEDIA_PUBLIC_URL` to its domain. Processed files are immutable.
- Set `COOKIE_SECURE=true`, real SMTP credentials and `NEXT_PUBLIC_SITE_URL` / `APP_URL` to the public domain.
- The map uses OpenFreeMap (free, no key). Any MapLibre style URL works via `NEXT_PUBLIC_MAP_STYLE_URL`.
