import clsx from 'clsx';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { LocationCard } from '@/components/catalogue/location-card';
import { Faq } from '@/components/home/faq';
import { Hero } from '@/components/home/hero';
import { Process } from '@/components/home/process';
import { LocationMap } from '@/components/map/location-map';
import { Picture } from '@/components/media/picture';
import { Headline } from '@/components/site/headline';
import { api } from '@/lib/api';
import { dict, href } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

/** Cluster cards go three to a row; a short last row (one or two cards) stretches to the full width */
function clusterSpan(i: number, n: number) {
  return { 2: 'lg:col-span-2', 3: 'lg:col-span-3', 6: 'lg:col-span-6' }[clusterCols(i, n)];
}
function clusterWidth(i: number, n: number) {
  return { 2: '33vw', 3: '50vw', 6: '100vw' }[clusterCols(i, n)];
}
function clusterCols(i: number, n: number): 2 | 3 | 6 {
  const rest = n % 3;
  if (rest === 0 || i < n - rest) return 2;
  return rest === 1 ? 6 : 3;
}

export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = (await params).lang as Lang;
  const t = dict(lang).home;
  const [home, map, site] = await Promise.all([api.home(lang), api.map(lang), api.site(lang).catch(() => null)]);

  return (
    <>
      <Hero lang={lang} hero={home.hero} tags={home.tags} stats={home.stats} highlights={home.highlights} />

      {/* Map */}
      <section className="relative py-20 sm:py-28">
        <div className="container-x">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="tag">{t.mapEyebrow}</p>
              <Headline text={t.mapTitle} className="mt-5 text-4xl leading-[1.02] text-white sm:text-6xl" />
              <p className="mt-5 max-w-2xl text-fg-muted">{t.mapText}</p>
            </div>
            <Link href={href(lang, '/locations?view=map')} className="group btn-ghost h-12 self-start pr-2 pl-6 lg:self-auto">
              {t.openDirectory}
              <span className="btn-dot ml-1">
                <ArrowUpRight className="size-4" />
              </span>
            </Link>
          </div>
          <div className="card mt-10 p-2">
            <LocationMap
              lang={lang}
              points={map.points}
              cooperative
              openLabel={dict(lang).catalogue.open}
              className="h-[520px] rounded-[20px] sm:h-[620px]"
            />
          </div>
        </div>
      </section>

      {/* Clusters */}
      <section className="py-20 sm:py-28">
        <div className="container-x">
          <div className="max-w-3xl">
            <p className="tag">{t.clustersEyebrow}</p>
            <Headline text={t.clustersTitle} className="mt-5 text-4xl leading-[1.02] text-white sm:text-6xl" />
            <p className="mt-5 max-w-2xl text-fg-muted">{t.clustersText}</p>
          </div>
          <div className="mt-12 grid gap-4 lg:grid-cols-6">
            {home.clusters.map((c, i) => (
              <Link
                key={c.slug}
                href={href(lang, `/locations?cluster=${c.slug}`)}
                className={clsx(
                  'group relative isolate flex min-h-[460px] flex-col justify-end overflow-hidden rounded-[28px] border border-white/[0.08] p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
                  clusterSpan(i, home.clusters.length),
                )}
              >
                <Picture image={c.cover} sizes={`(min-width: 1024px) ${clusterWidth(i, home.clusters.length)}, 100vw`} className="absolute inset-0 -z-10 size-full transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-black/35 to-black/10" />
                <div className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_120%,rgba(230,30,50,.45),transparent_70%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <span className="absolute top-6 left-7 font-mono text-xs text-white/55">{String(i + 1).padStart(2, '0')}</span>
                <span className="absolute top-5 right-5 flex size-11 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white backdrop-blur transition-all duration-300 group-hover:rotate-45 group-hover:border-accent group-hover:bg-accent">
                  <ArrowUpRight className="size-4" />
                </span>
                <p className="tag self-start">{c.tagline}</p>
                <h3 className="display mt-4 text-4xl text-white">{c.name}</h3>
                {c.description && <p className="mt-3 line-clamp-3 max-w-xl text-sm leading-relaxed text-white/70">{c.description}</p>}
                <p className="mt-5 font-mono text-xs text-white/55">{t.locationsCount(c.count)}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured */}
      {home.featured.length > 0 && (
        <section className="py-20 sm:py-28">
          <div className="container-x">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="tag">{t.featuredEyebrow}</p>
                <Headline text={t.featuredTitle} className="mt-5 text-4xl leading-[1.02] text-white sm:text-6xl" />
              </div>
              <Link href={href(lang, '/locations')} className="group btn-ghost h-12 self-start pr-2 pl-6">
                {t.openDirectory}
                <span className="btn-dot ml-1">
                  <ArrowUpRight className="size-4" />
                </span>
              </Link>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {home.featured.slice(0, 6).map((item) => (
                <LocationCard key={item.id} lang={lang} item={item} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Why Kazakhstan */}
      <section className="py-20 sm:py-28">
        <div className="container-x grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
          <div className="lg:sticky lg:top-[calc(var(--header-h)+32px)] lg:self-start">
            <p className="tag">{t.whyEyebrow}</p>
            <Headline text={t.whyTitle} className="mt-5 text-4xl leading-[1.02] text-white sm:text-6xl" />
            <p className="mt-6 text-lg leading-relaxed text-fg-muted">{t.whyText}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={href(lang, '/why-kazakhstan')} className="group btn-primary h-12 pr-2 pl-6">
                {t.whyMore}
                <span className="btn-dot ml-1">
                  <ArrowUpRight className="size-4" />
                </span>
              </Link>
              <Link href={href(lang, '/incentives')} className="btn-ghost h-12 px-6">
                {t.incentivesMore}
              </Link>
            </div>
          </div>
          {home.highlights.length > 0 && (
            <dl className="grid gap-4 sm:grid-cols-2">
              {home.highlights.map((h, i) => (
                <div
                  key={h.value + h.label}
                  className={clsx(
                    'flex min-h-[220px] flex-col justify-between rounded-3xl border p-7',
                    i === 0
                      ? 'border-accent/40 bg-[linear-gradient(160deg,#e61e32_0%,#7a0d18_45%,#140507_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_24px_60px_rgba(230,30,50,0.25)]'
                      : 'card',
                  )}
                >
                  <dt className="sr-only">{h.label}</dt>
                  <dd className="contents">
                    <p className={clsx('font-mono text-[11px]', i === 0 ? 'text-white/70' : 'text-white/35')}>{String(i + 1).padStart(2, '0')}</p>
                    <div>
                      <p className="stat text-5xl sm:text-6xl">{h.value}</p>
                      <p className={clsx('mt-3 text-sm leading-relaxed', i === 0 ? 'text-white/85' : 'text-fg-muted')}>{h.label}</p>
                    </div>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      <Process lang={lang} steps={site?.process ?? []} />

      <Faq lang={lang} site={site} />

      {/* CTA under a glowing crimson horizon */}
      <section className="relative isolate overflow-hidden py-28 sm:py-40">
        <div className="horizon-spill" />
        <div className="horizon horizon-top" />
        <div className="horizon horizon-bottom" />
        <div className="container-x relative text-center">
          <p className="tag">{t.ctaEyebrow}</p>
          <Headline text={t.ctaTitle} className="mx-auto mt-6 max-w-4xl text-4xl leading-[1.02] text-white sm:text-7xl" />
          <p className="mx-auto mt-6 max-w-2xl text-lg text-fg-muted">{t.ctaText}</p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link href={href(lang, '/request')} className="group btn-primary h-12 pr-2 pl-6">
              {t.ctaPrimary}
              <span className="btn-dot ml-1">
                <ArrowUpRight className="size-4" />
              </span>
            </Link>
            {site?.contacts.email && (
              <a href={`mailto:${site.contacts.email}`} className="btn-ghost h-12 px-6">
                {t.ctaSecondary}
              </a>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
