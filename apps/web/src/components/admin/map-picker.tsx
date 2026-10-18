'use client';

import type { Map as MlMap, Marker } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useLatest } from '@/lib/hooks';
import { addKazakhstanBorder } from '@/lib/kz-border';
import { KZ_BOUNDS, MAP_STYLE_URL } from '@/lib/site';

/** Click or drag the pin to set coordinates */
export function MapPicker({ lat, lng, onChange }: { lat: number | null; lng: number | null; onChange: (lat: number, lng: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const cb = useLatest(onChange);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !ref.current) return;
      const m = new maplibregl.Map({
        container: ref.current,
        style: MAP_STYLE_URL,
        ...(lat != null && lng != null ? { center: [lng, lat] as [number, number], zoom: 8 } : { bounds: KZ_BOUNDS }),
        attributionControl: { compact: true },
      });
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      m.on('load', () => void addKazakhstanBorder(m, { mask: false }).catch(() => undefined));
      map.current = m;
      const el = document.createElement('div');
      el.innerHTML = '<svg width="30" height="40" viewBox="-3 -3 30 40"><path d="M12 32S0 19.5 0 12a12 12 0 1 1 24 0c0 7.5-12 20-12 20Z" fill="#e61e32" stroke="#fff" stroke-width="1.5"/><path d="M9.5 7v10l8-5-8-5Z" fill="#fff"/></svg>';
      const mk = new maplibregl.Marker({ element: el, anchor: 'bottom', draggable: true });
      mk.on('dragend', () => {
        const p = mk.getLngLat();
        cb.current(round(p.lat), round(p.lng));
      });
      marker.current = mk;
      if (lat != null && lng != null) mk.setLngLat([lng, lat]).addTo(m);
      m.on('click', (e) => {
        mk.setLngLat(e.lngLat).addTo(m);
        cb.current(round(e.lngLat.lat), round(e.lngLat.lng));
      });
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Typed coordinates move the pin
  useEffect(() => {
    if (lat == null || lng == null || !map.current || !marker.current) return;
    marker.current.setLngLat([lng, lat]).addTo(map.current);
  }, [lat, lng]);

  return <div ref={ref} className="h-80 w-full overflow-hidden rounded-xl border border-border" />;
}

const round = (v: number) => Math.round(v * 1e5) / 1e5;
