import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import { resolve } from 'node:path';

// One .env for the whole monorepo (in containers the variables come from the environment)
loadEnvConfig(resolve(__dirname, '../..'));

// /api/* is proxied to the NestJS API: the browser talks to one origin, the CMS session cookie stays httpOnly
const API = (process.env.API_INTERNAL_URL || 'http://localhost:4360').replace(/\/$/, '');

const PANORAMA_ORIGINS = ['https://www.360cities.net', 'https://kuula.co', 'https://momento360.com', 'https://my.matterport.com'].map((o) => `"${o}"`).join(' ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Hosted 360° players (licensed embeds) may use the phone's motion sensors too
  { key: 'Permissions-Policy', value: `camera=(), microphone=(), geolocation=(), gyroscope=(self ${PANORAMA_ORIGINS}), accelerometer=(self ${PANORAMA_ORIGINS})` },
];

const nextConfig: NextConfig = {
  // Classic caching model: fetch() with tags + on-demand revalidation from the API after CMS edits
  cacheComponents: false,
  poweredByHeader: false,
  output: 'standalone',
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  images: {
    // Media is already resized by the worker into responsive WebP sizes and served by the CDN
    unoptimized: true,
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/api/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
