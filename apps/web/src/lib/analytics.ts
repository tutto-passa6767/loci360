/**
 * Browser side of the site statistics.
 * - Anonymous counters for the CMS (POST /api/public/collect): no cookies, nothing that identifies the visitor.
 * - Google Analytics 4 / Yandex Metrica, configured in CMS settings: loaded only after the visitor allows analytics
 *   cookies in the banner (components/site/analytics.tsx). Their page views are sent by hand on every route change.
 */

export type Consent = 'analytics' | 'necessary';
export interface AnalyticsIds {
  ga4Id: string | null;
  metrikaId: string | null;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    ym?: ((...args: unknown[]) => void) & { a?: unknown[]; l?: number };
  }
}

const CONSENT_COOKIE = 'loci_consent';
/** Fired by the "Cookie settings" link in the footer */
export const CONSENT_OPEN_EVENT = 'loci:consent-open';
/** Paths the collector accepts; anything else (encoded, uppercase) is not one of our pages */
const PATH = /^\/[a-z0-9/-]{0,160}$/;
const LOCATION_PATH = /^(?:\/ru)?\/locations\/([a-z0-9-]{1,80})$/;

let ids: AnalyticsIds = { ga4Id: null, metrikaId: null };
let thirdParty = false;
let lastView = '';
let lastUrl = '';

export const configureAnalytics = (next: AnalyticsIds) => {
  ids = next;
};

export function readConsent(): Consent | null {
  const m = /(?:^|;\s*)loci_consent=(analytics|necessary)/.exec(document.cookie);
  return (m?.[1] as Consent | undefined) ?? null;
}

export function writeConsent(c: Consent) {
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${CONSENT_COOKIE}=${c}; path=/; max-age=${180 * 86_400}; samesite=lax${secure}`;
}

/** Withdrawn consent: drop the analytics cookies the scripts set (they stay unloaded after the reload) */
export function clearAnalyticsCookies() {
  const host = window.location.hostname;
  const domains = ['', host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`];
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0].trim();
    if (!/^(_ga|_gid|_gat|_ym)/.test(name)) continue;
    for (const d of domains) document.cookie = `${name}=; path=/; max-age=0${d ? `; domain=${d}` : ''}`;
  }
}

function send(body: Record<string, unknown>) {
  try {
    void fetch('/api/public/collect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // statistics never break the page
  }
}

/** Load GA4 and/or Metrica once the visitor has allowed analytics cookies */
export function loadThirdParty() {
  if (thirdParty || (!ids.ga4Id && !ids.metrikaId)) return;
  thirdParty = true;
  if (ids.ga4Id) {
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = function gtag() {
      // gtag.js reads the arguments object itself
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
    window.gtag('js', new Date());
    window.gtag('config', ids.ga4Id, { send_page_view: false });
    addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ids.ga4Id)}`);
  }
  if (ids.metrikaId) {
    // The official stub: calls queue up in ym.a until tag.js arrives
    const queue: unknown[] = [];
    window.ym = Object.assign(
      function ym() {
        // eslint-disable-next-line prefer-rest-params
        queue.push(arguments);
      },
      { a: queue, l: Date.now() },
    );
    addScript('https://mc.yandex.ru/metrika/tag.js');
    // defer: page views go out by hand, like for GA4
    window.ym(Number(ids.metrikaId), 'init', { defer: true, clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false });
  }
}

function addScript(src: string) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

/** Page view for the third-party counters (after Next has updated the title) */
export function thirdPartyView() {
  if (!thirdParty) return;
  const url = window.location.href;
  const referer = lastUrl || document.referrer;
  lastUrl = url;
  window.setTimeout(() => {
    if (ids.ga4Id) window.gtag?.('event', 'page_view', { page_location: url, page_title: document.title });
    if (ids.metrikaId) window.ym?.(Number(ids.metrikaId), 'hit', url, { title: document.title, referer });
  }, 300);
}

/** A page view; the first one after the page loaded also counts as a visit with its referrer */
export function trackView(path: string, landing: boolean) {
  if (path === lastView) return; // React re-runs effects in development
  lastView = path;
  if (PATH.test(path)) {
    let r: string | undefined;
    if (landing && document.referrer) {
      try {
        if (new URL(document.referrer).host !== window.location.host) r = document.referrer.slice(0, 500);
      } catch {
        // no usable referrer
      }
    }
    send({ e: 'view', p: path, ...(landing ? { v: true } : {}), ...(r ? { r } : {}) });
  }
  thirdPartyView();
}

/** An action on a location: a reel started, the 360° view opened, added to the shortlist */
export function track(e: 'reel' | 'panorama' | 'shortlist', slug?: string) {
  const path = window.location.pathname;
  const l = slug ?? LOCATION_PATH.exec(path)?.[1];
  if (!l) return;
  if (PATH.test(path)) send({ e, p: path, l });
  if (thirdParty) {
    if (ids.ga4Id) window.gtag?.('event', `loci_${e}`, { location_slug: l });
    if (ids.metrikaId) window.ym?.(Number(ids.metrikaId), 'reachGoal', e, { location: l });
  }
}
