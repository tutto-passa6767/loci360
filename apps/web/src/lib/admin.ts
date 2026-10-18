'use client';

import useSWR, { type SWRConfiguration } from 'swr';
import { apiFetch } from './client-api';

/** SWR hook over the CMS API (`/api/...`) */
export function useApi<T>(path: string | null, config?: SWRConfiguration<T>) {
  return useSWR<T>(path, (p: string) => apiFetch<T>(p), { revalidateOnFocus: false, ...config });
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body: body ?? {} }),
  patch: <T>(path: string, body: unknown) => apiFetch<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body: unknown) => apiFetch<T>(path, { method: 'PUT', body }),
  del: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'EDITOR';
  blockedAt: string | null;
  totpEnabledAt: string | null;
}

export interface AdminAsset {
  id: string;
  kind: 'VIDEO' | 'PHOTO' | 'PANORAMA';
  title: string;
  originalName: string;
  size: number;
  mime: string | null;
  state: 'UPLOADING' | 'PENDING' | 'RUNNING' | 'READY' | 'FAILED';
  progress: number;
  error: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  credit: string | null;
  altEn: string | null;
  altRu: string | null;
  watermark: boolean;
  createdAt: string;
  processedAt: string | null;
  thumb: string | null;
  blur: string | null;
  preview: string | null;
  hls: string | null;
  panorama: { url: string; width: number; height: number }[] | null;
  usage?: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

export const fmtSize = (n: number) => {
  if (n < 1024) return `${n} Б`;
  const u = ['КБ', 'МБ', 'ГБ', 'ТБ'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`;
};

export const fmtDate = (d: string | null | undefined, withTime = true) =>
  d
    ? new Date(d).toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
      })
    : '—';

export const fmtDuration = (s: number | null) => {
  if (!s) return '';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};
