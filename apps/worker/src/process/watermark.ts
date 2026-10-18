import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { runOk } from '../tools';

/**
 * LOCI360 watermark — the geo-pin with a play button and the wordmark, white and semi-transparent
 * with a soft shadow so it stays readable on snow and on night skies. Rendered by libvips for the
 * exact video height, so it is sharp on 4K and not oversized on 720p.
 */
export async function renderWatermark(dir: string, videoHeight: number): Promise<{ path: string; width: number; height: number }> {
  const h = Math.max(18, Math.round(videoHeight * 0.042));
  const scale = h / 32;
  const w = Math.round(132 * scale);
  // Pin 24×32 + wordmark; viewBox is 132×32
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 132 32">
  <defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceAlpha" stdDeviation="1.2"/><feOffset dy="0.6"/><feComponentTransfer><feFuncA type="linear" slope="0.45"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <g filter="url(#s)" fill="#ffffff" fill-opacity="0.72">
    <path d="M12 32 C12 32 0 19.5 0 12 A12 12 0 1 1 24 12 C24 19.5 12 32 12 32 Z M9.5 7 L9.5 17 L17.5 12 Z" fill-rule="evenodd"/>
    <text x="31" y="21.5" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="17" letter-spacing="1.6">LOCI360</text>
  </g>
</svg>`;
  const svgPath = join(dir, `wm_${h}.svg`);
  const pngPath = join(dir, `wm_${h}.png`);
  await writeFile(svgPath, svg);
  await runOk('vips', ['copy', svgPath, pngPath], { timeoutMs: 60_000 });
  return { path: pngPath, width: w, height: h };
}
