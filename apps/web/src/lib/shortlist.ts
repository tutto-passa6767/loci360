'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { track } from './analytics';

/**
 * The visitor's shortlist of location slugs. It lives in this browser only (localStorage) and syncs across tabs;
 * a shortlist travels to colleagues as a link (/shortlist?l=slug1,slug2).
 */
const KEY = 'loci360.shortlist';
const EVENT = 'loci360:shortlist';
export const SHORTLIST_MAX = 24;

let cache: { raw: string | null; list: string[] } = { raw: null, list: [] };

function read(): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return cache.list; // storage blocked (private mode, policy): keep the in-memory list
  }
  if (raw === cache.raw) return cache.list;
  let list: string[] = [];
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) list = parsed.filter((s): s is string => typeof s === 'string' && /^[a-z0-9-]{1,80}$/.test(s)).slice(0, SHORTLIST_MAX);
  } catch {
    list = [];
  }
  cache = { raw, list };
  return list;
}

function write(list: string[]) {
  const next = [...new Set(list)].slice(0, SHORTLIST_MAX);
  const raw = JSON.stringify(next);
  cache = { raw, list: next };
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    // not persisted, but the page still works for this visit
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => e.key === KEY && onChange();
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

const EMPTY: string[] = [];

export function useShortlist() {
  // The server has no shortlist: render empty, then the browser fills it in
  const list = useSyncExternalStore(subscribe, read, () => EMPTY);
  const has = useCallback((slug: string) => list.includes(slug), [list]);
  const toggle = useCallback((slug: string) => {
    if (read().includes(slug)) write(read().filter((s) => s !== slug));
    else {
      write([...read(), slug]);
      track('shortlist', slug);
    }
  }, []);
  const remove = useCallback((slug: string) => write(read().filter((s) => s !== slug)), []);
  const addMany = useCallback((slugs: string[]) => write([...read(), ...slugs]), []);
  const clear = useCallback(() => write([]), []);
  return { list, has, toggle, remove, addMany, clear };
}
