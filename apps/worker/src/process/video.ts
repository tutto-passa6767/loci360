import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { DerivedMedia, DerivedRendition, DerivedSprite, Prisma } from '@loci/db';
import { cfg } from '../config';
import { originalUrl, putMedia, putMediaDir } from '../s3';
import { run, runOk, ToolError } from '../tools';
import { deriveStill, fileExists, Job, withWorkDir } from './common';
import { renderWatermark } from './watermark';

interface Stream {
  codec_type: string;
  codec_name?: string;
  profile?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  bit_rate?: string;
  pix_fmt?: string;
  color_transfer?: string;
  channels?: number;
  tags?: Record<string, string>;
  side_data_list?: { rotation?: number }[];
  disposition?: { attached_pic?: number };
}

interface Probe {
  streams: Stream[];
  format: { duration?: string; bit_rate?: string; format_name?: string };
}

/**
 * Quality ladder (short side). The spec asks for 4K / 1080p / 720p switching; 480p is added for weak mobile links.
 * Bitrates are for H.264 showreels — generous enough for grain, dust and night skies.
 */
const LADDER = [
  { q: 2160, kbps: 18_000 },
  { q: 1080, kbps: 6_500 },
  { q: 720, kbps: 3_500 },
  { q: 480, kbps: 1_500 },
];

const fps = (r?: string) => {
  if (!r) return 0;
  const [a, b] = r.split('/').map(Number);
  return b ? a / b : a || 0;
};
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

async function probe(url: string): Promise<Probe> {
  const r = await runOk('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', url], { timeoutMs: 5 * 60_000 });
  return JSON.parse(r.stdout) as Probe;
}

function describe(p: Probe) {
  const video = p.streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const audio = p.streams.find((s) => s.codec_type === 'audio');
  const rotation = Math.abs(video?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? Number(video?.tags?.rotate ?? 0)) % 180;
  const w = video?.width ?? 0;
  const h = video?.height ?? 0;
  const [width, height] = rotation === 90 ? [h, w] : [w, h];
  const hdr = video?.color_transfer === 'smpte2084' ? 'HDR10' : video?.color_transfer === 'arib-std-b67' ? 'HLG' : null;
  return {
    video,
    hasAudio: !!audio,
    width,
    height,
    duration: Number(p.format.duration ?? 0),
    fps: fps(video?.avg_frame_rate || video?.r_frame_rate) || 25,
    meta: {
      container: p.format.format_name,
      bitrate: Number(p.format.bit_rate ?? 0) || null,
      codec: video?.codec_name,
      profile: video?.profile,
      pixFmt: video?.pix_fmt,
      hdr,
      audio: audio ? { codec: audio.codec_name, channels: audio.channels } : null,
    },
  };
}

/**
 * Video: poster stills → HLS ladder with the watermark and a seek-preview sprite in one decoding pass →
 * short muted clip for card hover → muted 1080p loop for the home-page hero.
 * No rendition is larger than the source.
 */
export async function processVideo(job: Job): Promise<{ derived: DerivedMedia; patch: Prisma.AssetUpdateInput }> {
  const url = await originalUrl(job.asset.originalKey);
  const d = describe(await probe(url));
  if (!d.video || !d.width || !d.height) throw new Error('NO_VIDEO_STREAM: the file has no playable video track');

  return withWorkDir(job.asset.id, async (dir) => {
    // HDR masters are tone-mapped to SDR for web renditions (the original keeps HDR)
    const toSdr = d.meta.hdr
      ? 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,'
      : '';
    const at = d.duration > 4 ? Math.min(d.duration * 0.1, 20) : 0;

    // 1. poster
    const poster = join(dir, 'poster.png');
    await runOk('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-ss', String(at), '-i', url, '-frames:v', '1', '-vf', `${toSdr}scale='min(2560,iw)':-2`, poster], {
      timeoutMs: 10 * 60_000,
    });
    const still = await deriveStill(job, poster, dir, { name: 'poster' });
    await job.progress(5);

    // 2. ladder + sprite
    const portrait = d.height > d.width;
    const shortSide = Math.min(d.width, d.height);
    let rungs = LADDER.filter((r) => r.q <= shortSide);
    if (!rungs.length) rungs = [{ q: even(shortSide), kbps: 1_200 }];
    const srcKbps = (d.meta.bitrate ?? 0) / 1000;
    const variants = rungs.map((r, i) => {
      // Never spend more bits than the source has (with headroom for a less efficient codec)
      const kbps = Math.round(Math.max(Math.min(r.kbps, srcKbps ? srcKbps * 1.4 : r.kbps), r.kbps * 0.35));
      const width = portrait ? r.q : even((d.width * r.q) / d.height);
      const height = portrait ? even((d.height * r.q) / d.width) : r.q;
      return { name: `v${i}`, kbps, width, height };
    });

    const gop = Math.max(1, Math.round(d.fps * cfg.hlsSegmentSec));
    const interval = Math.max(cfg.spriteIntervalSec, Math.ceil(d.duration / 200));
    const tiles = Math.max(1, Math.ceil(d.duration / interval));
    const cols = Math.min(10, tiles);
    const rows = Math.ceil(tiles / cols);
    const tileW = portrait ? 90 : 160;
    const tileH = portrait ? 160 : 90;

    const out = join(dir, 'hls');
    for (const v of variants) await mkdir(join(out, v.name), { recursive: true });
    const sprite = join(dir, 'sprite.jpg');

    const inputs = ['-i', url];
    const decoded = `[0:v:0]${toSdr}format=yuv420p`;
    const graph: string[] = [];
    // `base` is what the split filter is appended to: a pad label, or a chain that needs a comma
    let base = `${decoded},`;
    if (job.asset.watermark) {
      const wm = await renderWatermark(dir, d.height);
      inputs.push('-i', wm.path);
      const margin = Math.round(d.height * 0.035);
      graph.push(`${decoded}[base]`, `[base][1:v]overlay=W-w-${margin}:H-h-${margin}:format=auto,format=yuv420p[wm]`);
      base = '[wm]';
    }
    // The sprite comes from the clean picture: it is a seeking aid, not distributed footage
    const split = variants.length;
    graph.push(
      `${base}split=${split}${variants.map((_, i) => `[s${i}]`).join('')}`,
      ...variants.map((v, i) => `[s${i}]scale=${v.width}:${v.height}:flags=lanczos[o${i}]`),
      `[0:v:0]${toSdr}fps=1/${interval},scale=${tileW}:${tileH}:force_original_aspect_ratio=decrease,pad=${tileW}:${tileH}:(ow-iw)/2:(oh-ih)/2,tile=${cols}x${rows}[spr]`,
    );

    const args = ['-hide_banner', '-nostdin', '-y', ...inputs, '-filter_complex', graph.join(';')];
    variants.forEach((v, i) => {
      args.push('-map', `[o${i}]`);
      if (d.hasAudio) args.push('-map', '0:a:0');
      args.push(
        `-c:v:${i}`, 'libx264', `-preset:v:${i}`, cfg.x264Preset, `-profile:v:${i}`, 'high',
        `-b:v:${i}`, `${v.kbps}k`, `-maxrate:v:${i}`, `${Math.round(v.kbps * 1.15)}k`, `-bufsize:v:${i}`, `${v.kbps * 2}k`,
        `-g:v:${i}`, String(gop), `-keyint_min:v:${i}`, String(gop),
      );
    });
    if (d.hasAudio) args.push('-c:a', 'aac', '-b:a', '160k', '-ac', '2');
    args.push(
      '-force_key_frames', `expr:gte(t,n_forced*${cfg.hlsSegmentSec})`,
      '-sc_threshold', '0',
      '-f', 'hls',
      '-hls_time', String(cfg.hlsSegmentSec),
      '-hls_playlist_type', 'vod',
      '-hls_segment_type', 'fmp4',
      '-hls_flags', 'independent_segments',
      '-hls_fmp4_init_filename', 'init.mp4',
      '-hls_segment_filename', join(out, 'v%v', 'seg_%05d.m4s'),
      '-master_pl_name', 'master.m3u8',
      '-var_stream_map', variants.map((_, i) => (d.hasAudio ? `v:${i},a:${i}` : `v:${i}`)).join(' '),
      join(out, 'v%v', 'index.m3u8'),
      '-map', '[spr]', '-frames:v', '1', '-q:v', '4', '-update', '1', sprite,
      '-progress', 'pipe:1', '-nostats',
    );

    let last = 0;
    const r = await run('ffmpeg', args, {
      onStdoutLine: (line) => {
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
        if (!m || !d.duration) return;
        // Real encoding progress, not a timer
        const pct = Math.min(85, 6 + Math.floor((Number(m[1]) / 1e6 / d.duration) * 79));
        if (pct >= last + 2) {
          last = pct;
          void job.progress(pct);
        }
      },
    });
    if (r.code !== 0) throw new ToolError('ffmpeg', r.code, r.stderr);

    const hlsPrefix = `${job.prefix}hls/`;
    await putMediaDir(hlsPrefix, out);
    let spriteMeta: DerivedSprite | undefined;
    if (await fileExists(sprite)) {
      const key = `${job.prefix}sprite.jpg`;
      await putMedia(key, sprite, 'image/jpeg');
      spriteMeta = { key, interval, cols, rows, tileW, tileH, count: tiles };
    }
    await job.progress(88);

    // 3. hover clip for cards: 6 s, 640 px, no sound
    const previewPath = join(dir, 'preview.mp4');
    const previewArgs = ['-hide_banner', '-nostdin', '-y', '-ss', String(at), '-t', '6', '-i', url, '-an'];
    previewArgs.push('-vf', `${toSdr}scale='if(gt(iw,ih),640,-2)':'if(gt(iw,ih),-2,640)',format=yuv420p`);
    previewArgs.push('-c:v', 'libx264', '-preset', cfg.x264Preset, '-crf', '28', '-profile:v', 'main', '-movflags', '+faststart', previewPath);
    const pr = await run('ffmpeg', previewArgs, { timeoutMs: 15 * 60_000 });
    let preview: string | undefined;
    if (pr.code === 0 && (await fileExists(previewPath))) {
      preview = `${job.prefix}preview.mp4`;
      await putMedia(preview, previewPath, 'video/mp4');
    }
    await job.progress(92);

    // 4. hero loop: up to 15 s at 1080p, starts at the poster frame, no sound and no watermark (decorative background)
    let loop: string | undefined;
    if (d.duration >= 4) {
      const loopPath = join(dir, 'loop.mp4');
      const len = Math.min(15, Math.max(4, d.duration - at));
      const lr = await run(
        'ffmpeg',
        [
          '-hide_banner', '-nostdin', '-y', '-ss', String(at), '-t', String(len), '-i', url, '-an',
          '-vf', `${toSdr}scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))',format=yuv420p`,
          '-c:v', 'libx264', '-preset', cfg.x264Preset, '-crf', '23', '-maxrate', '6M', '-bufsize', '12M', '-profile:v', 'high',
          '-movflags', '+faststart', loopPath,
        ],
        { timeoutMs: 30 * 60_000 },
      );
      if (lr.code === 0 && (await fileExists(loopPath))) {
        loop = `${job.prefix}loop.mp4`;
        await putMedia(loop, loopPath, 'video/mp4');
      }
    }

    const renditions: DerivedRendition[] = variants.map((v) => ({ name: v.name, width: v.width, height: v.height, bandwidth: v.kbps * 1000 }));
    return {
      derived: {
        rev: job.rev,
        ...still,
        video: { hls: `${hlsPrefix}master.m3u8`, renditions, sprite: spriteMeta, preview, loop, watermarked: job.asset.watermark },
      },
      patch: { width: d.width, height: d.height, durationSec: d.duration || null, meta: d.meta as Prisma.InputJsonValue },
    };
  });
}
