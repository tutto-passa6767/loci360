// End-to-end checks against a running stack (npm run infra:up, dev:api, dev:web).
//   npm run test:e2e
// Env: API (default http://localhost:4360/api), WEB (default http://localhost:3360), LOCI_EMAIL / LOCI_PASSWORD for CMS checks.
import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';

const API = (process.env.API ?? 'http://localhost:4360/api').replace(/\/$/, '');
const WEB = (process.env.WEB ?? 'http://localhost:3360').replace(/\/$/, '');
const EMAIL = process.env.LOCI_EMAIL ?? 'admin@loci360.kz';
const PASSWORD = process.env.LOCI_PASSWORD ?? 'loci360-admin-demo';

/** Tiny cookie-keeping client with the CSRF header */
function client() {
  const jar = {};
  const call = async (method, path, body) => {
    const res = await fetch(`${API}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
        'x-csrf-token': jar.loci_csrf ?? '',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      jar[pair.slice(0, i)] = pair.slice(i + 1);
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, json, text, headers: res.headers };
  };
  return { call, jar };
}

describe('public catalogue', () => {
  it('is healthy', async () => {
    const { json } = await client().call('GET', '/health');
    assert.equal(json.status, 'ok');
  });

  it('filters by genre AND landscape, OR inside a group', async () => {
    const c = client();
    const both = await c.call('GET', '/public/locations?genre=sci-fi&landscape=deserts&limit=60');
    assert.equal(both.status, 200);
    assert.ok(both.json.total > 0);
    for (const item of both.json.items) {
      assert.ok(item.genres.some((g) => g.slug === 'sci-fi'), `${item.slug} lacks sci-fi`);
      assert.ok(item.landscapes.some((l) => l.slug === 'deserts'), `${item.slug} lacks deserts`);
    }
    const either = await c.call('GET', '/public/locations?genre=sci-fi,western&limit=60');
    assert.ok(either.json.total >= both.json.total);
  });

  it('searches in Russian and English', async () => {
    const c = client();
    const ru = await c.call('GET', `/public/locations?q=${encodeURIComponent('чарын')}`);
    const en = await c.call('GET', '/public/locations?q=charyn');
    assert.ok(ru.json.items.some((i) => i.slug === 'charyn-canyon'));
    assert.ok(en.json.items.some((i) => i.slug === 'charyn-canyon'));
  });

  it('sorts by distance from an airport', async () => {
    const { json } = await client().call('GET', '/public/locations?sort=airport&limit=60');
    const km = json.items.map((i) => i.airportKm).filter((v) => v != null);
    assert.deepEqual(km, [...km].sort((a, b) => a - b));
  });

  it('rejects malformed filters', async () => {
    const { status, json } = await client().call('GET', '/public/locations?season=MONSOON');
    assert.equal(status, 400);
    assert.equal(json.code, 'VALIDATION_FAILED');
  });

  it('returns a localised location with the spec sheet', async () => {
    const { json } = await client().call('GET', '/public/locations/bozzhyra?lang=ru');
    assert.equal(json.name, 'Бозжыра');
    assert.equal(json.spec.airport.code, 'SCO');
    assert.ok(['FULL', 'LIMITED', 'OFFROAD', 'NONE'].includes(json.spec.heavyAccess));
  });

  it('hides drafts and unknown slugs', async () => {
    const { status } = await client().call('GET', '/public/locations/does-not-exist');
    assert.equal(status, 404);
  });

  it('generates a PDF spec sheet', async () => {
    const res = await fetch(`${API}/public/locations/charyn-canyon/spec-sheet.pdf?lang=ru`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(buf.length > 10_000);
  });

  it('builds a shortlist PDF dossier', async () => {
    const res = await fetch(`${API}/public/shortlist.pdf?l=charyn-canyon,bozzhyra,medeu-skating-rink&lang=en`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
    // cover + comparison + one page per location
    assert.ok((buf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length >= 5);
    assert.equal((await fetch(`${API}/public/shortlist.pdf?l=Not_A_Slug`)).status, 400);
    assert.equal((await fetch(`${API}/public/shortlist.pdf?l=no-such-place,another-one`)).status, 404);
  });

  it('returns 360° panoramas and monthly weather', async () => {
    const { json } = await client().call('GET', '/public/locations/medeu-skating-rink?lang=en');
    assert.ok(json.panoramas.length > 0, 'Medeu has demo panoramas');
    for (const p of json.panoramas) {
      assert.ok(p.sources.some((s) => s.width === 4096 && s.height === 2048), 'a 4096 px sphere for phones');
      assert.ok(p.credit);
    }
    // computed in the background on the first visit: null until then, 12 months after
    if (json.climate) assert.equal(json.climate.months.length, 12);
  });

  it('lists places with a 360° view first by default', async () => {
    const { json } = await client().call('GET', '/public/locations?limit=60');
    const flags = json.items.map((l) => l.hasPanorama);
    assert.ok(flags.includes(true));
    assert.equal(flags.indexOf(false), flags.lastIndexOf(true) + 1, 'no 360° place after one without');
  });

  it('never shows the same picture twice', async () => {
    const c = client();
    const list = await c.call('GET', '/public/locations?limit=60');
    const seen = new Map();
    for (const { slug } of list.json.items) {
      const { json } = await c.call('GET', `/public/locations/${slug}?lang=en`);
      // the cover is the page header, so it is not repeated in the gallery
      assert.ok(!json.photos.some((p) => p.src === json.cover?.src), `${slug}: cover repeated in the gallery`);
      const media = [...json.photos.map((p) => p.src), ...json.reels.map((r) => r.poster.src), ...json.broll.map((r) => r.poster.src), ...json.panoramas.map((p) => p.id)];
      for (const m of media) {
        assert.ok(!seen.has(m), `${slug}: ${m} is also used by ${seen.get(m)}`);
        seen.set(m, slug);
      }
    }
    // cluster cards have pictures of their own
    const home = await c.call('GET', '/public/home?lang=en');
    const covers = new Set(list.json.items.map((l) => l.cover?.src).filter(Boolean));
    for (const cl of home.json.clusters) assert.ok(!covers.has(cl.cover?.src) && !seen.has(cl.cover?.src), `cluster ${cl.slug} reuses a location picture`);
  });

  it('lists map points for every published location', async () => {
    const c = client();
    const map = await c.call('GET', '/public/map');
    const list = await c.call('GET', '/public/locations?limit=60');
    assert.equal(map.json.points.length, list.json.total);
    for (const p of map.json.points) {
      assert.ok(p.lat > 40 && p.lat < 56 && p.lng > 46 && p.lng < 88, `${p.slug} is outside Kazakhstan`);
    }
  });
});

describe('statistics', () => {
  const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
  const collect = (body, ua = BROWSER) =>
    fetch(`${API}/public/collect`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': ua }, body: JSON.stringify(body) });

  it('counts page views without CSRF and without setting cookies', async () => {
    const res = await collect({ e: 'view', p: '/locations/charyn-canyon', v: true, r: 'https://example.org/article' });
    assert.equal(res.status, 204);
    assert.equal(res.headers.getSetCookie().length, 0);
    assert.equal((await collect({ e: 'view', p: '/' }, 'Googlebot/2.1 (+http://www.google.com/bot.html)')).status, 204);
  });

  it('rejects paths that are not ours', async () => {
    assert.equal((await collect({ e: 'view', p: 'https://evil.example/' })).status, 400);
    assert.equal((await collect({ e: 'view', p: '/<script>' })).status, 400);
    assert.equal((await collect({ e: 'download', p: '/' })).status, 400);
  });
});

describe('scouting requests', () => {
  it('requires the CSRF token', async () => {
    const { status, json } = await client().call('POST', '/public/leads', {});
    assert.equal(status, 403);
    assert.equal(json.code, 'CSRF_FAILED');
  });

  // The form is rate-limited per IP (5 per 10 minutes): repeated runs skip instead of failing
  it('requires consent and a valid email', async (t) => {
    const c = client();
    await c.call('GET', '/auth/csrf');
    const base = { name: 'Test', company: 'E2E', country: 'GB', projectType: 'FEATURE', budget: 'UNDISCLOSED', email: 'e2e@example.com' };
    const noConsent = await c.call('POST', '/public/leads', base);
    if (noConsent.status === 429) return t.skip('rate limited');
    assert.equal(noConsent.json.code, 'CONSENT_REQUIRED');
    const badEmail = await c.call('POST', '/public/leads', { ...base, email: 'nope', consent: true });
    if (badEmail.status === 429) return t.skip('rate limited');
    assert.equal(badEmail.json.code, 'INVALID_EMAIL');
  });

  it('silently drops honeypot submissions', async (t) => {
    const c = client();
    await c.call('GET', '/auth/csrf');
    const res = await c.call('POST', '/public/leads', {
      name: 'Bot',
      company: 'Bot',
      country: 'US',
      projectType: 'OTHER',
      budget: 'UNDISCLOSED',
      email: 'bot@example.com',
      consent: true,
      website: 'http://spam.example',
    });
    if (res.status === 429) return t.skip('rate limited');
    assert.equal(res.status, 201);
    assert.equal(res.json.number, 0);
  });

  it('serves the manager card, the steps and the FAQ', async () => {
    const { json } = await client().call('GET', '/public/site?lang=ru');
    assert.ok(json.manager.email, 'the office email is the fallback contact');
    assert.ok(json.process.length > 0 && json.process.every((s) => s.title && s.text));
    assert.ok(json.faq.length > 0 && json.faq.every((x) => x.q && x.a));
  });

  it('requires consent for a short question', async (t) => {
    const c = client();
    await c.call('GET', '/auth/csrf');
    const res = await c.call('POST', '/public/questions', { name: 'E2E', email: 'e2e@example.com', message: 'Hello', consent: false });
    if (res.status === 429) return t.skip('rate limited');
    assert.equal(res.status, 400);
    assert.equal(res.json.code, 'CONSENT_REQUIRED');
  });
});

describe('CMS access', () => {
  let cms;
  before(async () => {
    cms = client();
    await cms.call('GET', '/auth/csrf');
  });

  it('keeps CMS routes closed without a session', async () => {
    const { status, json } = await client().call('GET', '/admin/leads');
    assert.equal(status, 401);
    assert.equal(json.code, 'UNAUTHENTICATED');
  });

  it('rejects a wrong password', async () => {
    const { status, json } = await cms.call('POST', '/auth/login', { email: EMAIL, password: 'definitely-wrong-password' });
    assert.equal(status, 401);
    assert.equal(json.code, 'INVALID_CREDENTIALS');
  });

  it('signs in and reads the dashboard', async () => {
    const login = await cms.call('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
    assert.equal(login.status, 200, login.text);
    assert.ok(!login.json.mfaRequired, 'use an account without 2FA for e2e');
    const dash = await cms.call('GET', '/admin/dashboard');
    assert.equal(dash.status, 200);
    assert.ok(dash.json.locations.PUBLISHED > 0);
  });

  it('creates, publishes and deletes a location', async () => {
    const created = await cms.call('POST', '/admin/locations', { nameEn: 'E2E Test Location', nameRu: 'Тест', summaryEn: 'Temporary', lat: 45, lng: 70 });
    assert.equal(created.status, 201, created.text);
    const id = created.json.id;
    try {
      assert.equal((await client().call('GET', `/public/locations/${created.json.slug}`)).status, 404, 'drafts must stay hidden');
      const published = await cms.call('PATCH', `/admin/locations/${id}`, { status: 'PUBLISHED' });
      assert.equal(published.json.status, 'PUBLISHED');
      assert.ok(published.json.publishedAt);
      const pub = await client().call('GET', `/public/locations/${created.json.slug}`);
      assert.equal(pub.status, 200);
    } finally {
      assert.equal((await cms.call('DELETE', `/admin/locations/${id}`)).status, 200);
    }
  });

  it('manages location photos one action at a time', async () => {
    const lib = await cms.call('GET', '/admin/assets?kind=PHOTO&state=READY&limit=3');
    assert.equal(lib.json.items.length, 3, 'needs three ready photos in the library');
    const [a, b, c] = lib.json.items.map((x) => x.id);
    const created = await cms.call('POST', '/admin/locations', { nameEn: 'E2E Photo Manager', nameRu: 'Тест фото', summaryEn: 'Temporary', lat: 45, lng: 70, status: 'PUBLISHED' });
    assert.equal(created.status, 201, created.text);
    const id = created.json.id;
    const photoIds = (loc) => loc.media.filter((m) => m.role === 'PHOTO').map((m) => m.assetId);
    try {
      // the first photo becomes the cover by itself; a retried attach is harmless
      let r = await cms.call('POST', `/admin/locations/${id}/media`, { assetId: a });
      assert.equal(r.status, 201, r.text);
      assert.equal(r.json.coverAssetId, a);
      r = await cms.call('POST', `/admin/locations/${id}/media`, { assetId: b, timeOfDay: 'NIGHT' });
      r = await cms.call('POST', `/admin/locations/${id}/media`, { assetId: b });
      assert.deepEqual(photoIds(r.json), [a, b]);
      assert.equal(r.json.media[1].timeOfDay, 'NIGHT');

      r = await cms.call('PATCH', `/admin/locations/${id}/media/${b}`, { timeOfDay: 'GOLDEN_HOUR', cover: true });
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json.coverAssetId, b);
      assert.equal(r.json.media[1].timeOfDay, 'GOLDEN_HOUR');

      r = await cms.call('PUT', `/admin/locations/${id}/media/order`, { assetIds: [b, a] });
      assert.deepEqual(photoIds(r.json), [b, a]);

      // a replaced cover hands over its place, time of day and the cover role
      r = await cms.call('POST', `/admin/locations/${id}/media`, { assetId: c, replaceAssetId: b });
      assert.deepEqual(photoIds(r.json), [c, a]);
      assert.equal(r.json.coverAssetId, c);
      assert.equal(r.json.media[0].timeOfDay, 'GOLDEN_HOUR');

      const list = await cms.call('GET', '/admin/locations?q=e2e%20photo%20manager');
      assert.equal(list.json.items[0].photos.count, 2);

      const pub = await client().call('GET', `/public/locations/${created.json.slug}`);
      assert.deepEqual(pub.json.photos.map((p) => p.id), [a], 'the cover stays out of the gallery');

      // removing the cover passes it to the next photo; the file stays in the library
      r = await cms.call('DELETE', `/admin/locations/${id}/media/${c}`);
      assert.equal(r.status, 200, r.text);
      assert.deepEqual(photoIds(r.json), [a]);
      assert.equal(r.json.coverAssetId, a);
      assert.equal((await cms.call('GET', `/admin/assets/${c}`)).status, 200);

      assert.equal((await cms.call('PATCH', `/admin/locations/${id}/media/${c}`, { cover: true })).status, 404);
      assert.equal((await cms.call('PUT', `/admin/locations/${id}/media/order`, { assetIds: [c] })).status, 400);

      // showreels: a video goes where it is put, switches to B-roll and back, carries a mood label
      const vids = await cms.call('GET', '/admin/assets?kind=VIDEO&state=READY&limit=2');
      const [v1, v2] = vids.json.items.map((x) => x.id);
      r = await cms.call('POST', `/admin/locations/${id}/media`, { assetId: v1, role: 'SHOWREEL' });
      r = await cms.call('POST', `/admin/locations/${id}/media`, { assetId: v2 });
      const roleOf = (loc, asset) => loc.media.find((m) => m.assetId === asset)?.role;
      assert.equal(roleOf(r.json, v1), 'SHOWREEL');
      assert.equal(roleOf(r.json, v2), 'BROLL', 'a second video defaults to B-roll');
      r = await cms.call('PATCH', `/admin/locations/${id}/media/${v2}`, { role: 'SHOWREEL', labelEn: 'Night', labelRu: 'Ночь' });
      assert.equal(r.status, 200, r.text);
      assert.equal(roleOf(r.json, v2), 'SHOWREEL');
      const reels = (await client().call('GET', `/public/locations/${created.json.slug}`)).json.reels;
      assert.deepEqual(reels.map((x) => x.label), [null, 'Night']);

      assert.equal((await cms.call('POST', `/admin/locations/${id}/media`, { assetId: b, role: 'SHOWREEL' })).json.code, 'ROLE_KIND_MISMATCH');
      assert.equal((await cms.call('POST', `/admin/locations/${id}/media`, { assetId: b, replaceAssetId: v1 })).json.code, 'ROLE_KIND_MISMATCH');
      assert.equal((await cms.call('PATCH', `/admin/locations/${id}/media/${v1}`, { role: 'PHOTO' })).json.code, 'ROLE_KIND_MISMATCH');
      assert.equal((await cms.call('PATCH', `/admin/locations/${id}/media/${v1}`, { cover: true })).json.code, 'COVER_NOT_PHOTO');
      const listed = await cms.call('GET', '/admin/locations?q=e2e%20photo%20manager');
      assert.equal(listed.json.items[0].photos.showreels, 2);
    } finally {
      assert.equal((await cms.call('DELETE', `/admin/locations/${id}`)).status, 200);
    }
  });

  it('reports anonymous statistics', async () => {
    const before = await cms.call('GET', '/admin/stats?days=7');
    assert.equal(before.status, 200);
    assert.equal(before.json.series.length, 7);
    const res = await fetch(`${API}/public/collect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0' },
      body: JSON.stringify({ e: 'view', p: '/ru/locations/bozzhyra' }),
    });
    assert.equal(res.status, 204);
    const after = await cms.call('GET', '/admin/stats?days=7');
    assert.equal(after.json.totals.view, before.json.totals.view + 1);
    assert.equal(after.json.totals.location, before.json.totals.location + 1);
    assert.ok(after.json.topLocations.some((l) => l.slug === 'bozzhyra'));
    assert.equal((await cms.call('GET', '/admin/stats?days=365')).status, 400);
  });

  it('validates analytics IDs and exposes them to the site', async () => {
    const bad = await cms.call('PUT', '/admin/settings/analytics', { ga4Id: 'UA-12345-1', metrikaId: '' });
    assert.equal(bad.status, 400);
    const ok = await cms.call('PUT', '/admin/settings/analytics', { ga4Id: 'g-e2etest01', metrikaId: '12345678' });
    assert.equal(ok.status, 200, ok.text);
    const site = await client().call('GET', '/public/site?lang=en');
    assert.deepEqual(site.json.analytics, { ga4Id: 'G-E2ETEST01', metrikaId: '12345678' });
    await cms.call('PUT', '/admin/settings/analytics', { ga4Id: '', metrikaId: '' });
    const off = await client().call('GET', '/public/site?lang=en');
    assert.deepEqual(off.json.analytics, { ga4Id: null, metrikaId: null });
  });

  it('takes a short question into the requests inbox', async (t) => {
    const c = client();
    await c.call('GET', '/auth/csrf');
    const res = await c.call('POST', '/public/questions', { name: 'E2E Question', email: 'e2e-question@example.com', message: 'Can we shoot here in winter?', consent: true, locale: 'en' });
    if (res.status === 429) return t.skip('rate limited');
    assert.equal(res.status, 201, res.text);
    const list = await cms.call('GET', '/admin/leads?limit=10');
    const lead = list.json.items.find((l) => l.number === res.json.number);
    assert.equal(lead?.kind, 'QUESTION');
    assert.equal((await cms.call('DELETE', `/admin/leads/${lead.id}`)).status, 200);
  });

  it('subscribes to the newsletter and unsubscribes by the letter link', async (t) => {
    const c = client();
    await c.call('GET', '/auth/csrf');
    const email = `e2e-${Date.now()}@example.com`;
    const sub = await c.call('POST', '/public/subscribe', { email, consent: true, locale: 'ru' });
    if (sub.status === 429) return t.skip('rate limited');
    assert.equal(sub.status, 200, sub.text);
    // subscribing twice says the same thing: nobody can probe the list
    assert.deepEqual((await c.call('POST', '/public/subscribe', { email, consent: true })).json, { ok: true });
    const csv = await cms.call('GET', '/admin/subscribers/export.csv');
    const line = csv.text.split('\r\n').find((l) => l.startsWith(email));
    const token = /token=([A-Za-z0-9_-]+)/.exec(line ?? '')?.[1];
    assert.ok(token, 'the export carries a personal unsubscribe link');
    assert.equal((await c.call('POST', '/public/unsubscribe', { token })).status, 200);
    const after = await cms.call('GET', `/admin/subscribers?search=${encodeURIComponent(email)}`);
    assert.ok(after.json.items[0].unsubscribedAt);
    assert.equal((await cms.call('DELETE', `/admin/subscribers/${after.json.items[0].id}`)).status, 200);
  });

  it('accepts only licensed 360° embed codes and ranks the place with them', async () => {
    const list = await cms.call('GET', '/admin/locations?limit=200');
    const loc = list.json.items.find((l) => l.slug === 'bozzhyra');
    const put = (code) => cms.call('PUT', `/admin/locations/${loc.id}/embeds`, { items: code ? [{ code, labelEn: 'E2E' }] : [] });
    assert.equal((await put('https://www.360cities.net/image/the-tract-boszhira-2')).json.code, 'EMBED_NOT_ALLOWED', 'a free page link is not a licence');
    assert.equal((await put('<iframe src="https://evil.example/360"></iframe>')).status, 400);
    const ok = await put('<iframe src="https://www.360cities.net/paid_embed_iframe/e2e0000/the-tract-boszhira-2" width="425" height="315"></iframe>');
    assert.equal(ok.status, 200, ok.text);
    const pub = await client().call('GET', '/public/locations/bozzhyra?lang=en');
    assert.equal(pub.json.panoramaEmbeds[0].provider, '360Cities');
    const card = (await client().call('GET', '/public/locations?limit=60')).json.items.find((l) => l.slug === 'bozzhyra');
    assert.equal(card.hasPanorama, true);
    assert.equal((await put(null)).status, 200);
    const after = (await client().call('GET', '/public/locations?limit=60')).json.items.find((l) => l.slug === 'bozzhyra');
    assert.equal(after.hasPanorama, false);
  });

  it('exports requests as CSV', async () => {
    const res = await cms.call('GET', '/admin/leads/export.csv');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    assert.match(res.text, /Number,Created,Status/);
  });
});

describe('web', () => {
  for (const [path, status] of [
    ['/', 200],
    ['/locations', 200],
    ['/ru/locations', 200],
    ['/locations/charyn-canyon', 200],
    ['/request', 200],
    ['/incentives', 200],
    ['/services', 200],
    ['/ru/unsubscribe?token=abc', 200],
    ['/locations/nope', 404],
    ['/sitemap.xml', 200],
  ]) {
    it(`GET ${path} → ${status}`, async () => {
      const res = await fetch(`${WEB}${path}`, { redirect: 'manual' });
      assert.equal(res.status, status);
    });
  }

  it('redirects /en/... to the canonical English URL', async () => {
    const res = await fetch(`${WEB}/en/locations`, { redirect: 'manual' });
    assert.equal(res.status, 308);
    assert.equal(new URL(res.headers.get('location'), WEB).pathname, '/locations');
  });

  it('marks the page language and alternates', async () => {
    const html = await (await fetch(`${WEB}/ru/locations/bozzhyra`)).text();
    assert.match(html, /<html lang="ru"/);
    assert.match(html, /hrefLang="en"|hreflang="en"/i);
    assert.match(html, /Бозжыра/);
  });

  it('rejects revalidation without the secret', async () => {
    const res = await fetch(`${WEB}/hooks/revalidate`, { method: 'POST', body: '{"tags":["locations"]}', headers: { 'content-type': 'application/json' } });
    assert.equal(res.status, 401);
  });
});
