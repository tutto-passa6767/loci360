import { AppError } from './errors';

/**
 * 360° players the CMS accepts. Only their own embed URLs: a licensed 360Cities "Hosted Embed" (paid_embed_iframe),
 * Kuula and Momento360 share links, a Matterport tour, a Google Street View embed. Anything else is refused, so the
 * CMS can never put an arbitrary iframe on the site.
 */
const PROVIDERS: { name: string; host: RegExp; path: RegExp }[] = [
  { name: '360Cities', host: /^(www\.)?360cities\.net$/, path: /^\/paid_embed_iframe\/[\w-]+\/[\w-]+\/?$/ },
  { name: 'Kuula', host: /^kuula\.co$/, path: /^\/share\/[\w/-]+$/ },
  { name: 'Momento360', host: /^momento360\.com$/, path: /^\/e\/[\w/-]+$/ },
  { name: 'Matterport', host: /^my\.matterport\.com$/, path: /^\/show\/?$/ },
  { name: 'Google Street View', host: /^www\.google\.com$/, path: /^\/maps\/embed(\/v1\/streetview)?\/?$/ },
];

/** The provider of a stored (already checked) player URL */
export function embedProvider(src: string): string {
  try {
    const u = new URL(src);
    return PROVIDERS.find((p) => p.host.test(u.hostname))?.name ?? u.hostname;
  } catch {
    return '';
  }
}

/** Accepts the pasted <iframe …> code or a bare URL; returns the player URL or throws */
export function parseEmbed(input: string, field: string): string {
  const fromIframe = /src\s*=\s*["']([^"']+)["']/i.exec(input)?.[1];
  const raw = (fromIframe ?? input).trim().replace(/&amp;/g, '&');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(400, 'INVALID_EMBED', 'Paste the embed code or the player link', { fields: [field] });
  }
  if (url.protocol !== 'https:' || !PROVIDERS.some((p) => p.host.test(url.hostname) && p.path.test(url.pathname))) {
    throw new AppError(400, 'EMBED_NOT_ALLOWED', 'Use an embed code from 360Cities (licensed Hosted Embed), Kuula, Momento360, Matterport or Google Street View', {
      fields: [field],
    });
  }
  return url.toString().slice(0, 1000);
}
