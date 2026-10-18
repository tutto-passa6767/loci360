import { ArrowUpRight, ChevronRight, Download, ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LocationCard } from '@/components/catalogue/location-card';
import { ClimateChart } from '@/components/location/climate-chart';
import { CopyButton } from '@/components/location/copy-button';
import { Gallery } from '@/components/location/gallery';
import { Panorama } from '@/components/location/panorama';
import { Reels } from '@/components/location/reels';
import { SunPlanner } from '@/components/location/sun-planner';
import { ShortlistButton } from '@/components/shortlist/shortlist-button';
import { LocationMap } from '@/components/map/location-map';
import { Picture } from '@/components/media/picture';
import { api } from '@/lib/api';
import { accessLabel, connectivityLabel, coord, dict, droneLabel, href, num, powerLabel, seasonLabel } from '@/lib/i18n';
import { SITE_URL } from '@/lib/site';
import type { Lang } from '@/lib/types';

type Props = { params: Promise<{ lang: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params;
  const loc = await api.location(lang as Lang, slug);
  const path = `/locations/${slug}`;
  return {
    title: loc.seo.title,
    description: loc.seo.description ?? undefined,
    alternates: { canonical: href(lang as Lang, path), languages: { en: path, ru: `/ru${path}`, 'x-default': path } },
    // A page-level openGraph replaces the layout's, so the site name and locale are repeated here
    openGraph: {
      type: 'article',
      siteName: 'LOCI360',
      locale: lang === 'ru' ? 'ru_RU' : 'en_US',
      title: loc.seo.title,
      description: loc.seo.description ?? undefined,
      images: loc.seo.image ? [{ url: loc.seo.image.url, width: loc.seo.image.width, height: loc.seo.image.height, alt: loc.name }] : undefined,
    },
  };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)] gap-4 border-t border-border py-3.5 first:border-t-0">
      <dt className="text-sm text-fg-subtle">{label}</dt>
      <dd className="text-sm font-medium text-white">{children}</dd>
    </div>
  );
}

export default async function LocationPage({ params }: Props) {
  const { lang: l, slug } = await params;
  const lang = l as Lang;
  const t = dict(lang).location;
  const loc = await api.location(lang, slug);
  const s = loc.spec;
  const km = (v: number | null | undefined) => (v != null ? `${num(lang, v)} ${t.km}` : null);
  const gps = `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`;
  const pdf = `/api/public/locations/${loc.slug}/spec-sheet.pdf?lang=${lang}`;
  const requestHref = href(lang, `/request?locations=${loc.slug}`);
  const hasMedia = loc.reels.length + loc.photos.length + loc.panoramas.length + (loc.panoramaEmbeds?.length ?? 0) > 0;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    name: loc.name,
    description: loc.summary,
    url: `${SITE_URL}${href(lang, `/locations/${loc.slug}`)}`,
    image: loc.cover?.src,
    geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lng, elevation: s.elevationM ?? undefined },
    address: { '@type': 'PostalAddress', addressRegion: loc.region ?? undefined, addressCountry: 'KZ' },
  };

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      {/* Cover */}
      <header className="relative isolate flex min-h-[78svh] flex-col justify-end overflow-hidden bg-black">
        <Picture image={loc.cover} priority sizes="100vw" className="absolute inset-0 -z-10 size-full" />
        <div className="grain absolute inset-0 -z-10 bg-gradient-to-b from-black/55 via-black/10 to-black" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(0,0,0,.75)_0%,rgba(0,0,0,.25)_50%,transparent_75%)]" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(50%_40%_at_90%_100%,rgba(230,30,50,.28),transparent_70%)] mix-blend-screen" />
        <div className="container-x pt-[calc(var(--header-h)+40px)] pb-12">
          <nav className="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.12em] text-white/60 uppercase" aria-label="Breadcrumbs">
            <Link href={href(lang, '/locations')} className="hover:text-white">
              {t.breadcrumbs}
            </Link>
            {loc.cluster && (
              <>
                <ChevronRight className="size-3" />
                <Link href={href(lang, `/locations?cluster=${loc.cluster.slug}`)} className="hover:text-white">
                  {loc.cluster.name}
                </Link>
              </>
            )}
          </nav>
          <h1 className="display mt-4 max-w-5xl text-5xl leading-[0.98] text-white sm:text-7xl">{loc.name}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/80">{loc.summary}</p>
          <div className="mt-6 flex flex-wrap gap-1.5">
            {loc.genres.map((g) => (
              <Link key={g.slug} href={href(lang, `/locations?genre=${g.slug}`)} className="chip border-white/20 bg-black/30 text-white/85 backdrop-blur hover:text-white">
                {g.label}
              </Link>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={pdf} className="btn-light" download>
              <Download className="size-4" /> {t.downloadPdf}
            </a>
            <ShortlistButton lang={lang} slug={loc.slug} name={loc.name} variant="pill" />
            <Link href={requestHref} className="group btn-primary pr-1.5 pl-5">
              {t.request}
              <span className="btn-dot ml-1">
                <ArrowUpRight className="size-4" />
              </span>
            </Link>
          </div>
          <dl className="mt-10 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              [t.gps, `${coord(s.lat, 'N', 'S')} ${coord(s.lng, 'E', 'W')}`],
              [t.elevation, s.elevationM != null ? `${num(lang, s.elevationM)} ${t.m}` : '—'],
              [t.airport, s.airport ? [s.airport.code, km(s.airport.km)].filter(Boolean).join(' · ') : '—'],
              [t.heavyAccess, accessLabel(lang, s.heavyAccess).split(' — ')[0]],
            ].map(([k, v]) => (
              <div key={k} className="glass rounded-2xl px-4 py-3.5">
                <dt className="font-mono text-[10px] tracking-[0.14em] text-white/50 uppercase">{k}</dt>
                <dd className="mt-1 text-sm font-semibold text-white">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      {/* Media */}
      <div className="container-x space-y-20 py-16 sm:py-24">
        {(loc.reels.length > 0 || loc.broll.length > 0) && (
          <section aria-labelledby="reel">
            <h2 id="reel" className="tag mb-6">
              {t.showreel}
            </h2>
            <Reels lang={lang} reels={loc.reels} broll={loc.broll} />
          </section>
        )}

        <section className="grid gap-12 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
          <div>
            <h2 className="tag">{t.about}</h2>
            <div className="mt-5 space-y-5 text-[17px] leading-[1.75] text-fg-muted">
              {loc.description.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <dl className="mt-8 space-y-4">
              {[
                [t.landscapes, loc.landscapes],
                [t.eras, loc.eras],
              ].map(([label, list]) =>
                (list as { slug: string; label: string }[]).length ? (
                  <div key={label as string}>
                    <dt className="font-mono text-[10px] tracking-[0.14em] text-fg-subtle uppercase">{label as string}</dt>
                    <dd className="mt-2 flex flex-wrap gap-1.5">
                      {(list as { slug: string; label: string }[]).map((x) => (
                        <span key={x.slug} className="chip">
                          {x.label}
                        </span>
                      ))}
                    </dd>
                  </div>
                ) : null,
              )}
            </dl>
            {!hasMedia && <p className="mt-8 rounded-2xl border border-accent/40 bg-accent-soft p-5 text-sm text-white">{t.noMedia}</p>}
          </div>

          {/* Spec sheet */}
          <aside id="spec" className="card self-start p-6 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-semibold text-white">{t.spec}</h2>
              <a href={pdf} download className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-bright hover:text-white">
                <Download className="size-3.5" /> PDF
              </a>
            </div>
            <p className="eyebrow mt-6 mb-1">{t.geo}</p>
            <dl>
              <Row label={t.gps}>
                <span className="flex flex-wrap items-center gap-2 font-mono text-[13px]">
                  {gps} <CopyButton text={gps} label={t.copy} done={t.copied} />
                </span>
              </Row>
              <Row label={t.elevation}>{s.elevationM != null ? `${num(lang, s.elevationM)} ${t.m}` : null}</Row>
              <Row label={t.airport}>{s.airport ? [[s.airport.code, s.airport.name].filter(Boolean).join(' — '), km(s.airport.km)].filter(Boolean).join(' · ') : null}</Row>
              <Row label={t.driveTime}>{s.driveHours != null ? `${num(lang, s.driveHours)} ${t.h}` : null}</Row>
              <Row label={t.rail}>{s.rail ? [s.rail.name, km(s.rail.km)].filter(Boolean).join(' · ') : null}</Row>
              <Row label={t.town}>{s.town ? [s.town.name, km(s.town.km)].filter(Boolean).join(' · ') : null}</Row>
              <Row label={t.heavyAccess}>{accessLabel(lang, s.heavyAccess)}</Row>
              <Row label={t.accessNotes}>{s.accessNotes}</Row>
            </dl>
            <p className="eyebrow mt-6 mb-1">{t.infra}</p>
            <dl>
              <Row label={t.connectivity}>{connectivityLabel(lang, s.connectivity)}</Row>
              <Row label={t.power}>{powerLabel(lang, s.power)}</Row>
              <Row label={t.hotels}>{[s.hotels, km(s.hotelKm)].filter(Boolean).join(' · ') || null}</Row>
            </dl>
            <p className="eyebrow mt-6 mb-1">{t.restrictions}</p>
            <dl>
              <Row label={t.nationalPark}>{s.nationalPark ? t.yes : t.no}</Row>
              <Row label={t.borderZone}>{s.borderZone ? t.yes : t.no}</Row>
              <Row label={t.drone}>{droneLabel(lang, s.drone)}</Row>
              <Row label={t.permitNotes}>{s.permitNotes}</Row>
            </dl>
            <p className="eyebrow mt-6 mb-1">{t.climate}</p>
            <dl>
              <Row label={t.seasons}>{s.seasons.map((x) => seasonLabel(lang, x)).join(', ') || null}</Row>
              <Row label={t.climate}>{s.climate}</Row>
            </dl>
            <Link href={requestHref} className="btn-primary mt-6 w-full">
              {t.request}
            </Link>
          </aside>
        </section>

        {loc.photos.length > 0 && (
          <section aria-labelledby="photos">
            <h2 id="photos" className="tag mb-6">
              {t.photos}
            </h2>
            <Gallery lang={lang} photos={loc.photos} />
          </section>
        )}

        {loc.panoramas.length + (loc.panoramaEmbeds?.length ?? 0) > 0 && (
          <section aria-labelledby="pano">
            <h2 id="pano" className="tag mb-6">
              {t.panorama}
            </h2>
            <Panorama lang={lang} panoramas={loc.panoramas} embeds={loc.panoramaEmbeds ?? []} />
          </section>
        )}

        <section aria-label={dict(lang).sun.eyebrow}>
          <SunPlanner lang={lang} lat={s.lat} lng={s.lng} />
        </section>

        {loc.climate && (
          <section aria-label={dict(lang).climate.eyebrow}>
            <ClimateChart lang={lang} climate={loc.climate} seasons={s.seasons} />
          </section>
        )}

        <section aria-labelledby="map">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 id="map" className="tag">
              {t.onMap}
            </h2>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-bright hover:text-white"
            >
              {t.openInMaps} <ExternalLink className="size-3.5" />
            </a>
          </div>
          <LocationMap
            lang={lang}
            single
            cooperative
            points={[{ slug: loc.slug, name: loc.name, summary: loc.summary, region: loc.region, lat: s.lat, lng: s.lng, featured: false, cluster: loc.cluster?.slug ?? null, thumb: loc.cover?.src ?? null, genres: loc.genres.map((g) => g.label) }]}
            openLabel={dict(lang).catalogue.open}
            className="h-[420px] rounded-3xl border border-border"
          />
        </section>

        {loc.related.length > 0 && (
          <section aria-labelledby="related">
            <h2 id="related" className="display mb-8 text-3xl text-white sm:text-4xl">
              {t.related}
            </h2>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {loc.related.map((r) => (
                <LocationCard key={r.id} lang={lang} item={r} />
              ))}
            </div>
          </section>
        )}
      </div>
    </article>
  );
}
