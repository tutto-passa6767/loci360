import { NextResponse, type NextRequest } from 'next/server';

/**
 * Language routing. English is the primary language and lives at the root (/locations),
 * Russian under /ru (/ru/locations). Internally every public page sits under app/[lang]:
 * root paths are rewritten to /en/…, and an explicit /en/… is redirected to the canonical root URL.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname === '/en' || pathname.startsWith('/en/')) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(3) || '/';
    return NextResponse.redirect(url, 308);
  }
  if (pathname === '/ru' || pathname.startsWith('/ru/')) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = `/en${pathname === '/' ? '' : pathname}`;
  url.search = search;
  return NextResponse.rewrite(url);
}

export const config = {
  // Everything except the API proxy, the CMS, internal hooks, Next assets and files with an extension
  matcher: ['/((?!api|admin|hooks|_next|.*\\..*).*)'],
};
