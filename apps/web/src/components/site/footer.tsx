import Link from 'next/link';
import { dict, href } from '@/lib/i18n';
import type { Lang, SiteData, Taxonomy } from '@/lib/types';
import { CookieSettingsLink } from './analytics';
import { Logo } from './logo';
import { NewsletterForm } from './newsletter-form';

/** "Almaty cluster" / "Кластер Сарыарка" → "Almaty" / "Сарыарка": the column heading already says "Clusters" */
const shortCluster = (name: string) => {
  const s = name.replace(/s*(cluster|кластер)s*/i, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function Footer({ lang, site, clusters }: { lang: Lang; site: SiteData | null; clusters: Taxonomy['clusters'] }) {
  const t = dict(lang);
  const c = site?.contacts;
  const social = Object.entries(site?.social ?? {}).filter(([, url]) => url);
  return (
    <footer className="relative overflow-hidden border-t border-white/[0.06] bg-black">
      <div className="container-x grid gap-12 py-16 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.8fr_1fr_1fr_1.2fr]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-5 text-sm leading-relaxed text-fg-muted">{t.footer.tagline}</p>
          <div className="mt-8">
            <NewsletterForm lang={lang} />
          </div>
        </div>
        <div>
          <p className="eyebrow mb-4">{t.footer.explore}</p>
          <ul className="space-y-2.5 text-sm">
            <li><Link className="text-fg-muted hover:text-white" href={href(lang, '/locations')}>{t.nav.locations}</Link></li>
            <li><Link className="text-fg-muted hover:text-white" href={href(lang, '/locations?view=map')}>{t.nav.map}</Link></li>
            <li><Link className="text-fg-muted hover:text-white" href={href(lang, '/shortlist')}>{t.shortlist.title}</Link></li>
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-4">{t.footer.clusters}</p>
          <ul className="space-y-2.5 text-sm">
            {clusters.map((c) => (
              <li key={c.slug}>
                <Link className="text-fg-muted hover:text-white" href={href(lang, `/locations?cluster=${c.slug}`)}>{shortCluster(c.name)}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-4">{t.footer.support}</p>
          <ul className="space-y-2.5 text-sm">
            <li><Link className="text-fg-muted hover:text-white" href={href(lang, '/why-kazakhstan')}>{t.nav.why}</Link></li>
            <li><Link className="text-fg-muted hover:text-white" href={href(lang, '/incentives')}>{t.nav.incentives}</Link></li>
            <li><Link className="text-fg-muted hover:text-white" href={href(lang, '/permits')}>{t.nav.permits}</Link></li>
            <li><Link className="text-fg-muted hover:text-white" href={href(lang, '/services')}>{t.nav.services}</Link></li>
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-4">{t.footer.contact}</p>
          {c && (
            <address className="space-y-2.5 text-sm text-fg-muted not-italic">
              <p className="font-medium text-white">{c.organisation}</p>
              {c.address && <p>{c.address}</p>}
              {c.email && (
                <p>
                  <a className="hover:text-white" href={`mailto:${c.email}`}>{c.email}</a>
                </p>
              )}
              {c.phone && (
                <p>
                  <a className="hover:text-white" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>{c.phone}</a>
                </p>
              )}
            </address>
          )}
          {social.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {social.map(([name, url]) => (
                <a key={name} href={url} target="_blank" rel="noopener noreferrer" className="chip capitalize hover:text-white">
                  {name}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Oversized wordmark fading into the black */}
      <p aria-hidden="true" className="pointer-events-none container-x -mb-[2.5vw] bg-linear-to-b from-white/[0.1] to-white/0 bg-clip-text font-display text-[21vw] leading-[0.8] font-medium tracking-[-0.06em] text-transparent select-none">
        LOCI360
      </p>
      <div className="relative border-t border-white/[0.06]">
        <div className="container-x flex flex-col gap-2 py-6 text-xs text-fg-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} LOCI360. {t.footer.rights}</p>
          <div className="flex gap-5">
            {(site?.analytics?.ga4Id || site?.analytics?.metrikaId) && <CookieSettingsLink label={t.footer.cookies} />}
            <Link className="hover:text-white" href={href(lang, '/privacy')}>{t.footer.privacy}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
