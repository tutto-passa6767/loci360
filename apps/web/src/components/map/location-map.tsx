'use client';

import clsx from 'clsx';
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useLatest } from '@/lib/hooks';
import { href } from '@/lib/i18n';
import { addKazakhstanBorder } from '@/lib/kz-border';
import { KZ_BOUNDS, MAP_STYLE_URL } from '@/lib/site';
import type { Lang, MapPoint } from '@/lib/types';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Brand pin (geo-pin with a play button) rasterised for the map at device pixel ratio */
function pinImage(ratio: number, featured: boolean): Promise<HTMLImageElement> {
  const w = 30 * ratio;
  const h = 40 * ratio;
  const fill = featured ? '#ffffff' : '#e61e32';
  const play = featured ? '#e61e32' : '#ffffff';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="-3 -3 30 40">
    <path d="M12 32S0 19.5 0 12a12 12 0 1 1 24 0c0 7.5-12 20-12 20Z" fill="${fill}" stroke="rgba(0,0,0,.45)" stroke-width="1.2"/>
    <path d="M9.5 7v10l8-5-8-5Z" fill="${play}"/></svg>`;
  return new Promise((resolve, reject) => {
    const img = new Image(w, h);
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

interface Props {
  lang: Lang;
  points: MapPoint[];
  className?: string;
  /** Single-location mode: no clustering, fixed zoom */
  single?: boolean;
  /** Zoom to fit the points instead of the whole country */
  fit?: boolean;
  /** Text for the popup link */
  openLabel?: string;
  /** Map stays put until the visitor clicks into it (embedded on long pages) */
  cooperative?: boolean;
}

/**
 * Interactive map: dark cinematic style, brand pins, clusters when zoomed out,
 * preview card on click. MapLibre + OpenFreeMap — no API keys, no per-view fees.
 */
export function LocationMap({ lang, points, className, single = false, fit = false, openLabel = 'Open location', cooperative = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const pointsRef = useLatest(points);

  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !ref.current) return;
      try {
        map = new maplibregl.Map({
          container: ref.current,
          style: MAP_STYLE_URL,
          bounds: single ? undefined : KZ_BOUNDS,
          center: single && points[0] ? [points[0].lng, points[0].lat] : undefined,
          zoom: single ? 7.5 : undefined,
          fitBoundsOptions: { padding: 24 },
          attributionControl: { compact: true },
          cooperativeGestures: cooperative,
          dragRotate: false,
          pitchWithRotate: false,
        });
      } catch {
        setFailed(true);
        return;
      }
      mapRef.current = map;
      map.touchZoomRotate.disableRotation();
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.on('error', (e) => {
        console.warn('map:', e.error?.message ?? e);
        // A missing tile is not fatal; a failed style is
        if (!map?.isStyleLoaded() && String(e.error?.message ?? '').includes('style')) setFailed(true);
      });
      // Icons the base style references but its sprite lacks: an empty image keeps the console quiet
      map.on('styleimagemissing', (e) => {
        if (map && !map.hasImage(e.id)) map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
      });

      map.on('load', async () => {
        if (!map) return;
        // Cinematic tint: near-black land and water, so the crimson pins carry the colour
        if (map.getLayer('water')) map.setPaintProperty('water', 'fill-color', '#0c0d10');
        if (map.getLayer('background')) map.setPaintProperty('background', 'background-color', '#050505');

        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const [pin, pinFeatured] = await Promise.all([
          pinImage(ratio, false),
          pinImage(ratio, true),
          // The country stands out: neighbours dimmed, border in crimson (a failed fetch just leaves the plain map)
          addKazakhstanBorder(map).catch(() => undefined),
        ]);
        if (!map) return;
        if (!map.hasImage('loci-pin')) map.addImage('loci-pin', pin, { pixelRatio: ratio });
        if (!map.hasImage('loci-pin-featured')) map.addImage('loci-pin-featured', pinFeatured, { pixelRatio: ratio });

        map.addSource('locations', {
          type: 'geojson',
          data: toGeoJSON(pointsRef.current),
          cluster: !single,
          clusterRadius: 46,
          clusterMaxZoom: 9,
        });
        map.addLayer({
          id: 'cluster-halo',
          type: 'circle',
          source: 'locations',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': 'rgba(230,30,50,0.28)',
            'circle-radius': ['step', ['get', 'point_count'], 26, 5, 32, 12, 40],
          },
        });
        map.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'locations',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#e61e32',
            'circle-radius': ['step', ['get', 'point_count'], 17, 5, 21, 12, 27],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': 'rgba(255,255,255,0.65)',
          },
        });
        map.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'locations',
          filter: ['has', 'point_count'],
          layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Regular'], 'text-size': 13 },
          paint: { 'text-color': '#ffffff' },
        });
        map.addLayer({
          id: 'pins',
          type: 'symbol',
          source: 'locations',
          filter: ['!', ['has', 'point_count']],
          layout: {
            'icon-image': ['case', ['get', 'featured'], 'loci-pin-featured', 'loci-pin'],
            'icon-anchor': 'bottom',
            'icon-allow-overlap': true,
            'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.85, 10, 1.1],
          },
        });

        map.on('click', 'clusters', async (e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (!f || !map) return;
          const src = map.getSource('locations') as GeoJSONSource;
          const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id as number);
          map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom + 0.3, duration: 600 });
        });

        map.on('click', 'pins', (e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (!f || !map) return;
          const p = pointsRef.current.find((x) => x.slug === f.properties.slug);
          if (!p) return;
          const link = href(lang, `/locations/${p.slug}`);
          const html = `
            <a href="${link}" class="block w-[260px] text-left no-underline">
              <div class="relative aspect-[16/9] w-full overflow-hidden bg-[#0b0b0b]">
                ${p.thumb ? `<img src="${esc(p.thumb)}" alt="" class="absolute inset-0 h-full w-full object-cover" loading="lazy"/>` : '<div class="topo absolute inset-0"></div>'}
              </div>
              <div class="p-3.5">
                <p class="text-[15px] font-semibold leading-snug text-white">${esc(p.name)}</p>
                ${p.region ? `<p class="mt-0.5 text-xs text-[#a6abb6]">${esc(p.region)}</p>` : ''}
                ${p.genres.length ? `<p class="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#ff5263]">${p.genres.map(esc).join(' · ')}</p>` : ''}
                <p class="mt-3 text-[13px] font-semibold text-white">${esc(openLabel)} →</p>
              </div>
            </a>`;
          new maplibregl.Popup({ offset: [0, -36], maxWidth: '280px', closeButton: true })
            .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
            .setHTML(html)
            .addTo(map);
        });

        for (const layer of ['clusters', 'pins']) {
          map.on('mouseenter', layer, () => map && (map.getCanvas().style.cursor = 'pointer'));
          map.on('mouseleave', layer, () => map && (map.getCanvas().style.cursor = ''));
        }

        if (fit && pointsRef.current.length > 1) fitTo(map, pointsRef.current);
        setReady(true);
      });
    })();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // The map is created once; point updates go through setData below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const src = map.getSource('locations') as GeoJSONSource | undefined;
    src?.setData(toGeoJSON(points));
    if (fit && points.length > 1) fitTo(map, points);
  }, [points, ready, fit]);

  return (
    <div className={clsx('relative overflow-hidden bg-[#050505]', className)}>
      {/* maplibre-gl.css makes the container position:relative, so it needs an explicit size */}
      <div ref={ref} className="size-full" />
      {!ready && !failed && <div className="topo absolute inset-0 animate-pulse" />}
      {failed && (
        <div className="topo absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-fg-muted">
          Map is unavailable right now.
        </div>
      )}
    </div>
  );
}

function toGeoJSON(points: MapPoint[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { slug: p.slug, featured: p.featured },
    })),
  };
}

function fitTo(map: MlMap, points: MapPoint[]) {
  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  map.fitBounds(
    [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    { padding: 60, maxZoom: 9, duration: 600 },
  );
}
