'use client';

import clsx from 'clsx';
import { Glasses, Loader2, Maximize, Minimize, Orbit, Smartphone } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Picture } from '@/components/media/picture';
import { track } from '@/lib/analytics';
import { dict } from '@/lib/i18n';
import type { Lang, PanoramaEmbed, PublicPanorama } from '@/lib/types';

type Strings = ReturnType<typeof dict>['location'];

type Item = { kind: 'own'; id: string; label: string | null; credit: string | null; pano: PublicPanorama } | { kind: 'embed'; id: string; label: string | null; credit: string | null; embed: PanoramaEmbed };

/**
 * The location's 360° views: our own spheres (three.js, below) and hosted ones from panorama services (a licensed
 * embed code), with a strip of the others. A hosted player is a third-party page, so it loads only after a click.
 * Full screen lives on the frame, so switching views keeps it; where the browser has no element full screen
 * (iPhone) the frame covers the window instead.
 */
export function Panorama({ lang, panoramas, embeds = [] }: { lang: Lang; panoramas: PublicPanorama[]; embeds?: PanoramaEmbed[] }) {
  const t = dict(lang).location;
  const items: Item[] = [
    ...panoramas.map((p) => ({ kind: 'own' as const, id: p.id, label: p.label, credit: p.credit, pano: p })),
    ...embeds.map((e) => ({ kind: 'embed' as const, id: e.id, label: e.label, credit: e.credit, embed: e })),
  ];
  const [index, setIndex] = useState(0);
  const [active, setActive] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const item = items[index];
  const many = items.length > 1;

  const toggleFullscreen = useCallback(() => {
    const el = frame.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (fullscreen) setFullscreen(false);
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => setFullscreen(true));
    else setFullscreen(true);
  }, [fullscreen]);

  useEffect(() => {
    const on = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  // Window-covering fallback: Escape closes it and the page underneath must not scroll
  const covering = fullscreen && typeof document !== 'undefined' && !document.fullscreenElement;
  useEffect(() => {
    if (!covering) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFullscreen(false);
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [covering]);

  if (!item) return null;

  const open = (i: number) => {
    if (!active) track('panorama');
    setIndex(i);
    setActive(true);
  };
  const name = (x: Item, i: number) => x.label ?? `360° ${i + 1}`;

  return (
    <div>
      <div
        ref={frame}
        className={clsx(
          'relative overflow-hidden bg-black',
          fullscreen ? (covering ? 'fixed inset-0 z-[100]' : 'size-full') : 'aspect-[4/3] w-full rounded-3xl border border-border sm:aspect-[21/9] sm:min-h-[360px]',
        )}
      >
        {active ? (
          item.kind === 'own' ? (
            <Viewer key={item.id} pano={item.pano} t={t} fullscreen={fullscreen} raised={fullscreen && many} onFullscreen={toggleFullscreen} />
          ) : (
            <EmbedPlayer key={item.id} embed={item.embed} t={t} fullscreen={fullscreen} onFullscreen={toggleFullscreen} />
          )
        ) : (
          <button type="button" onClick={() => open(index)} className="group absolute inset-0 block" aria-label={item.label ? t.panoramaOf(item.label) : t.enterPanorama}>
            {item.kind === 'own' ? (
              <>
                <Picture image={item.pano.preview} sizes="(min-width: 1280px) 1200px, 100vw" className="absolute inset-0 size-full transition-transform duration-700 group-hover:scale-105" />
                <span className="absolute inset-0 bg-black/35" />
              </>
            ) : (
              <span className="topo absolute inset-0" />
            )}
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white">
              <span className="flex size-20 items-center justify-center rounded-full bg-accent shadow-[0_10px_40px_var(--accent-glow)] transition-transform group-hover:scale-105">
                <Orbit className="size-9" />
              </span>
              <span className="text-sm font-semibold">{item.kind === 'embed' && item.label ? item.label : t.enterPanorama}</span>
              {item.kind === 'embed' && <span className="text-xs text-white/60">{t.panoramaProvider(item.embed.provider)}</span>}
            </span>
          </button>
        )}
        {active && fullscreen && many && (
          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2 overflow-x-auto px-4">
            {items.map((x, i) => (
              <button
                key={x.id}
                type="button"
                aria-pressed={i === index}
                onClick={() => open(i)}
                className={clsx('shrink-0 rounded-full px-3 py-1.5 text-xs backdrop-blur transition-colors', i === index ? 'bg-accent text-white' : 'bg-black/55 text-white/85 hover:bg-black/75')}
              >
                {name(x, i)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* The other views only: the current one is the big frame above */}
      {many && (
        <div role="group" aria-label={t.panoramas} className="mt-3 flex gap-3 overflow-x-auto pb-1">
          {items.map((x, i) =>
            i === index ? null : (
              <button key={x.id} type="button" onClick={() => open(i)} className="group w-36 shrink-0 text-left sm:w-44">
                <span className="relative block aspect-[2/1] overflow-hidden rounded-xl border border-border transition-colors group-hover:border-border-strong">
                  {x.kind === 'own' ? (
                    <Picture image={x.pano.preview} sizes="176px" className="size-full transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <span className="topo absolute inset-0 flex items-center justify-center">
                      <Orbit className="size-6 text-accent-bright" />
                    </span>
                  )}
                </span>
                <span className="mt-1.5 block text-xs leading-snug text-fg-muted group-hover:text-white">{name(x, i)}</span>
              </button>
            ),
          )}
        </div>
      )}
      {item.credit && <p className="mt-2 text-xs text-fg-subtle">© {item.credit}</p>}
    </div>
  );
}

/** A hosted 360° player (360Cities, Kuula, Matterport…): the provider's own viewer in an iframe */
function EmbedPlayer({ embed, t, fullscreen, onFullscreen }: { embed: PanoramaEmbed; t: Strings; fullscreen: boolean; onFullscreen: () => void }) {
  return (
    <div className="absolute inset-0">
      <iframe
        src={embed.src}
        title={embed.label ? t.panoramaOf(embed.label) : t.panorama}
        className="size-full border-0"
        allow="fullscreen; gyroscope; accelerometer; xr-spatial-tracking"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <button
        type="button"
        onClick={onFullscreen}
        aria-label={fullscreen ? t.exitFullscreen : t.fullscreen}
        title={fullscreen ? t.exitFullscreen : t.fullscreen}
        className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75"
      >
        {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
      </button>
    </div>
  );
}

interface Controls {
  nudge: (dLon: number, dLat: number, dFov: number) => void;
  motion: (on: boolean) => Promise<boolean>;
  vr: () => Promise<void>;
}

/**
 * The sphere itself. Opens on a 4096 px texture and swaps in the 8192 px one when the device can hold it
 * (desktops; phones report large limits but run out of memory). Drag or arrow keys to look around; Ctrl + wheel,
 * pinch or +/− to zoom (a plain wheel keeps scrolling the page unless the viewer is full screen); phones can follow
 * the gyroscope, WebXR headsets get an immersive VR mode. Rendering stops while the viewer is off screen.
 */
function Viewer({ pano, t, fullscreen, raised, onFullscreen }: { pano: PublicPanorama; t: Strings; fullscreen: boolean; raised: boolean; onFullscreen: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const controls = useRef<Controls | null>(null);
  const fullscreenRef = useRef(fullscreen);
  const [loading, setLoading] = useState(true);
  const [touched, setTouched] = useState(false);
  const [coarse, setCoarse] = useState(false);
  const [zoomHint, setZoomHint] = useState(false);
  const [canMotion, setCanMotion] = useState(false);
  const [motion, setMotion] = useState(false);
  const [canVr, setCanVr] = useState(false);

  useEffect(() => {
    fullscreenRef.current = fullscreen;
  }, [fullscreen]);

  useEffect(() => {
    let disposed = false;
    const trash: (() => void)[] = [];
    (async () => {
      const THREE = await import('three');
      const el = host.current;
      if (!el || disposed) return;
      const isCoarse = window.matchMedia('(pointer: coarse)').matches;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setCoarse(isCoarse);
      setCanMotion(isCoarse && 'DeviceOrientationEvent' in window);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const canvas = renderer.domElement;
      canvas.style.touchAction = 'none';
      canvas.style.cursor = 'grab';
      el.appendChild(canvas);
      trash.push(() => {
        renderer.setAnimationLoop(null);
        renderer.dispose();
        // Switching panoramas remounts the viewer: give the WebGL context back instead of piling them up
        renderer.forceContextLoss();
        canvas.remove();
      });

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, el.clientWidth / el.clientHeight, 0.1, 100);
      const geometry = new THREE.SphereGeometry(10, 64, 40);
      geometry.scale(-1, 1, 1);
      trash.push(() => geometry.dispose());

      const limit = Math.min(renderer.capabilities.maxTextureSize, isCoarse ? 4096 : 8192);
      const fitting = pano.sources.filter((s) => s.width <= limit).sort((a, b) => a.width - b.width);
      const first = fitting[0] ?? [...pano.sources].sort((a, b) => a.width - b.width)[0];
      const best = fitting.at(-1);
      const loader = new THREE.TextureLoader();
      const prepare = (tex: InstanceType<typeof THREE.Texture>) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        return tex;
      };
      const material = new THREE.MeshBasicMaterial();
      trash.push(() => {
        material.map?.dispose();
        material.dispose();
      });
      const texture = await loader.loadAsync(first.url).catch(() => null);
      if (disposed || !texture) {
        texture?.dispose();
        return;
      }
      material.map = prepare(texture);
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      setLoading(false);
      if (best && best.width > first.width) {
        loader
          .loadAsync(best.url)
          .then((sharp) => {
            if (disposed) return sharp.dispose();
            const old = material.map;
            material.map = prepare(sharp);
            material.needsUpdate = true;
            old?.dispose();
          })
          .catch(() => {});
      }

      // View direction in degrees; lon 180 faces the middle of the photo
      let lon = 180;
      let lat = 0;
      let interacted = false;
      const fov = (v: number) => {
        camera.fov = THREE.MathUtils.clamp(v, 30, 95);
        camera.updateProjectionMatrix();
      };
      const interact = () => {
        if (interacted) return;
        interacted = true;
        setTouched(true);
      };

      // --- pointer: one finger / mouse drags, two fingers pinch
      const pointers = new Map<number, { x: number; y: number }>();
      let drag: { x: number; y: number; lon: number; lat: number; yaw: number } | null = null;
      let pinch = 0;
      const restartDrag = () => {
        pinch = 0;
        const [p] = pointers.values();
        drag = pointers.size === 1 && p ? { x: p.x, y: p.y, lon, lat, yaw } : null;
      };
      const onDown = (e: PointerEvent) => {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = 'grabbing';
        interact();
        restartDrag();
      };
      const onMove = (e: PointerEvent) => {
        if (!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch) fov(camera.fov * (pinch / d));
          pinch = d;
          return;
        }
        if (!drag) return;
        const speed = camera.fov / el.clientHeight;
        if (motionOn) yaw = drag.yaw - (e.clientX - drag.x) * speed;
        else {
          lon = drag.lon - (e.clientX - drag.x) * speed;
          lat = THREE.MathUtils.clamp(drag.lat + (e.clientY - drag.y) * speed, -85, 85);
        }
      };
      const onUp = (e: PointerEvent) => {
        pointers.delete(e.pointerId);
        restartDrag();
        if (!pointers.size) canvas.style.cursor = 'grab';
      };
      let hintTimer = 0;
      const onWheel = (e: WheelEvent) => {
        // A plain wheel scrolls the page; zoom needs Ctrl/⌘ (trackpad pinch sends ctrlKey) or full screen
        if (!fullscreenRef.current && !e.ctrlKey && !e.metaKey) {
          setZoomHint(true);
          window.clearTimeout(hintTimer);
          hintTimer = window.setTimeout(() => setZoomHint(false), 1600);
          return;
        }
        e.preventDefault();
        interact();
        fov(camera.fov + e.deltaY * 0.04);
      };
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      trash.push(() => window.clearTimeout(hintTimer));

      // --- gyroscope (three.js DeviceOrientationControls maths); yaw keeps the current view when it switches on
      let motionOn = false;
      let device: { alpha: number; beta: number; gamma: number } | null = null;
      let yaw = 0;
      let yawSet = false;
      const onOrient = (e: DeviceOrientationEvent) => {
        if (e.alpha != null) device = { alpha: e.alpha, beta: e.beta ?? 0, gamma: e.gamma ?? 0 };
      };
      const euler = new THREE.Euler();
      const qDevice = new THREE.Quaternion();
      const qYaw = new THREE.Quaternion();
      const qScreen = new THREE.Quaternion();
      const qTilt = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // look out of the back of the phone
      const zAxis = new THREE.Vector3(0, 0, 1);
      const yAxis = new THREE.Vector3(0, 1, 0);
      const forward = new THREE.Vector3();
      const stopMotion = () => {
        window.removeEventListener('deviceorientation', onOrient);
        motionOn = false;
      };
      trash.push(stopMotion);

      // --- render loop, paused off screen
      const target = new THREE.Vector3();
      const deg = THREE.MathUtils.degToRad;
      const tick = () => {
        if (renderer.xr.isPresenting) {
          renderer.render(scene, camera);
          return;
        }
        if (!interacted && !reducedMotion && !motionOn) lon += 0.03;
        if (motionOn && device) {
          euler.set(deg(device.beta), deg(device.alpha), -deg(device.gamma), 'YXZ');
          qDevice.setFromEuler(euler).multiply(qTilt).multiply(qScreen.setFromAxisAngle(zAxis, -deg(screen.orientation?.angle ?? 0)));
          forward.set(0, 0, -1).applyQuaternion(qDevice);
          const deviceLon = THREE.MathUtils.radToDeg(Math.atan2(forward.z, forward.x));
          if (!yawSet) {
            yaw = lon - deviceLon;
            yawSet = true;
          }
          camera.quaternion.copy(qYaw.setFromAxisAngle(yAxis, -deg(yaw))).multiply(qDevice);
          lon = deviceLon + yaw;
          lat = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1)));
        } else {
          const phi = deg(90 - lat);
          const theta = deg(lon);
          target.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
          camera.lookAt(target);
        }
        renderer.render(scene, camera);
      };
      renderer.setAnimationLoop(tick);
      const io = new IntersectionObserver(([entry]) => {
        if (renderer.xr.isPresenting) return;
        renderer.setAnimationLoop(entry.isIntersecting ? tick : null);
      });
      io.observe(el);
      trash.push(() => io.disconnect());

      const resize = () => {
        if (renderer.xr.isPresenting) return;
        renderer.setSize(el.clientWidth, el.clientHeight);
        camera.aspect = el.clientWidth / el.clientHeight;
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      trash.push(() => ro.disconnect());

      // --- WebXR headsets (Quest browser, Android Chrome with a viewer)
      const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
      xr?.isSessionSupported('immersive-vr')
        .then((ok) => !disposed && setCanVr(ok))
        .catch(() => {});

      controls.current = {
        nudge: (dLon, dLat, dFov) => {
          interact();
          if (motionOn) yaw += dLon;
          else {
            lon += dLon;
            lat = THREE.MathUtils.clamp(lat + dLat, -85, 85);
          }
          if (dFov) fov(camera.fov + dFov);
        },
        motion: async (on) => {
          if (!on) {
            stopMotion();
            return false;
          }
          // iOS asks for permission, and only from inside the tap handler — this is the first await
          const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> };
          if (typeof DOE.requestPermission === 'function' && (await DOE.requestPermission().catch(() => 'denied')) !== 'granted') return false;
          interact();
          device = null;
          yawSet = false;
          motionOn = true;
          window.addEventListener('deviceorientation', onOrient);
          // No sensor (a laptop with a touch screen): give up quietly
          window.setTimeout(() => {
            if (!disposed && motionOn && !device) {
              stopMotion();
              setMotion(false);
              setCanMotion(false);
            }
          }, 1500);
          return true;
        },
        vr: async () => {
          if (!xr) return;
          const session = await xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
          interact();
          // The headset looks down −z: turn the sphere so the current view is straight ahead
          mesh.rotation.y = deg(lon + 90);
          renderer.xr.enabled = true;
          renderer.xr.setReferenceSpaceType('local');
          session.addEventListener('end', () => {
            renderer.xr.enabled = false;
            mesh.rotation.y = 0;
            resize();
          });
          await renderer.xr.setSession(session);
        },
      };
      trash.push(() => {
        controls.current = null;
      });
    })();
    return () => {
      disposed = true;
      trash.reverse().forEach((f) => f());
    };
  }, [pano]);

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 15 : 5;
    const moves: Record<string, [number, number, number]> = {
      ArrowLeft: [-step, 0, 0],
      ArrowRight: [step, 0, 0],
      ArrowUp: [0, step, 0],
      ArrowDown: [0, -step, 0],
      '+': [0, 0, -8],
      '=': [0, 0, -8],
      '-': [0, 0, 8],
    };
    const m = moves[e.key];
    if (!m || !controls.current) return;
    e.preventDefault();
    controls.current.nudge(...m);
  };

  const toggleMotion = async () => {
    if (!controls.current) return;
    setMotion(await controls.current.motion(!motion));
  };

  const button = 'flex size-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75';
  return (
    <div
      className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-accent-bright focus-visible:ring-inset"
      tabIndex={0}
      role="application"
      aria-roledescription="360°"
      aria-label={pano.label ? t.panoramaOf(pano.label) : t.panorama}
      onKeyDown={onKey}
    >
      <div ref={host} className="absolute inset-0" />
      {loading && (
        <div className="absolute inset-0">
          <Picture image={pano.preview} className="absolute inset-0 size-full scale-105 blur-sm" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Loader2 className="size-10 animate-spin text-white" />
          </span>
        </div>
      )}
      {pano.label && <p className="pointer-events-none absolute top-4 left-4 max-w-[60%] rounded-full bg-black/55 px-3 py-1.5 text-xs text-white backdrop-blur">{pano.label}</p>}
      <div className="absolute top-4 right-4 flex gap-2">
        {canMotion && (
          <button type="button" onClick={() => void toggleMotion()} aria-pressed={motion} aria-label={t.panoramaMotion} title={t.panoramaMotion} className={clsx(button, motion && 'bg-accent hover:bg-accent')}>
            <Smartphone className="size-5" />
          </button>
        )}
        {canVr && (
          <button type="button" onClick={() => void controls.current?.vr()} aria-label={t.panoramaVr} title={t.panoramaVr} className={button}>
            <Glasses className="size-5" />
          </button>
        )}
        <button type="button" onClick={onFullscreen} aria-label={fullscreen ? t.exitFullscreen : t.fullscreen} title={fullscreen ? t.exitFullscreen : t.fullscreen} className={button}>
          {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
        </button>
      </div>
      {!touched && !loading && (
        <p className={clsx('pointer-events-none absolute left-4 rounded-full bg-black/55 px-3 py-1.5 text-xs text-white/85 backdrop-blur', raised ? 'bottom-16' : 'bottom-4')}>
          {coarse ? t.panoramaHintTouch : t.panoramaHint}
        </p>
      )}
      <p
        aria-live="polite"
        className={clsx(
          'pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/70 px-4 py-2 text-sm text-white backdrop-blur transition-opacity duration-300',
          zoomHint ? 'opacity-100' : 'opacity-0',
        )}
      >
        {zoomHint ? t.panoramaZoom : ''}
      </p>
    </div>
  );
}
