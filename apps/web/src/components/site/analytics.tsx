'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  type AnalyticsIds,
  type Consent,
  CONSENT_OPEN_EVENT,
  clearAnalyticsCookies,
  configureAnalytics,
  loadThirdParty,
  readConsent,
  thirdPartyView,
  trackView,
  writeConsent,
} from '@/lib/analytics';
import { dict, href } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

/**
 * Counts page views and, when GA4 / Yandex Metrica are configured in the CMS, asks for consent before loading them.
 * Without third-party counters there is nothing to consent to, so no banner is shown.
 */
export function Analytics({ lang, ids }: { lang: Lang; ids: AnalyticsIds }) {
  const t = dict(lang).cookies;
  const pathname = usePathname();
  const landing = useRef(true);
  const [banner, setBanner] = useState(false);
  const hasThirdParty = !!(ids.ga4Id || ids.metrikaId);

  useEffect(() => {
    configureAnalytics(ids);
    if (!hasThirdParty) return;
    const consent = readConsent();
    if (consent === 'analytics') loadThirdParty();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the cookie is only readable in the browser
    else if (!consent) setBanner(true);
    const open = () => setBanner(true);
    window.addEventListener(CONSENT_OPEN_EVENT, open);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, open);
  }, [ids, hasThirdParty]);

  useEffect(() => {
    trackView(pathname, landing.current);
    landing.current = false;
  }, [pathname]);

  const choose = (c: Consent) => {
    const before = readConsent();
    writeConsent(c);
    setBanner(false);
    if (c === 'analytics') {
      loadThirdParty();
      thirdPartyView();
    } else if (before === 'analytics') {
      // The scripts are already running: drop their cookies and start clean without them
      clearAnalyticsCookies();
      window.location.reload();
    }
  };

  if (!banner) return null;
  const services = [ids.ga4Id ? 'Google Analytics' : null, ids.metrikaId ? t.metrica : null].filter(Boolean).join(t.and);
  return (
    <div role="dialog" aria-labelledby="cookie-title" aria-describedby="cookie-text" className="fixed inset-x-3 bottom-3 z-[90] sm:right-auto sm:bottom-6 sm:left-6 sm:max-w-md">
      <div className="rounded-3xl border border-border-strong bg-[#0c0c0c]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,.6)] backdrop-blur sm:p-6">
        <p id="cookie-title" className="font-display text-xl text-white">
          {t.title}
        </p>
        <p id="cookie-text" className="mt-2 text-sm leading-relaxed text-fg-muted">
          {t.text(services)}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="btn-primary h-10 px-5" onClick={() => choose('analytics')}>
            {t.accept}
          </button>
          <button type="button" className="btn-ghost h-10 px-5" onClick={() => choose('necessary')}>
            {t.reject}
          </button>
        </div>
        <Link href={href(lang, '/privacy')} className="mt-4 inline-block text-xs text-fg-subtle underline underline-offset-2 hover:text-white">
          {t.policy}
        </Link>
      </div>
    </div>
  );
}

/** Footer link that reopens the banner (only rendered when there is something to consent to) */
export function CookieSettingsLink({ label }: { label: string }) {
  return (
    <button type="button" className="text-left hover:text-white" onClick={() => window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))}>
      {label}
    </button>
  );
}
