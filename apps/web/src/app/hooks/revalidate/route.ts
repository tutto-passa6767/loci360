import { revalidateTag } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

const TAGS = new Set(['locations', 'taxonomy', 'home', 'pages', 'services', 'site']);

/**
 * Called by the API (after CMS edits) and by the media worker (after processing).
 * The next visitor gets fresh data: { expire: 0 } means stale content is never served.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET ?? '';
  const got = req.headers.get('x-revalidate-secret') ?? '';
  const ok = secret.length > 0 && got.length === secret.length && timingSafeEqual(Buffer.from(got), Buffer.from(secret));
  if (!ok) return Response.json({ ok: false }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { tags?: unknown };
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === 'string' && TAGS.has(t)) : [];
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return Response.json({ ok: true, tags });
}
