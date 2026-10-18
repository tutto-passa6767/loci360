# LOCI360 media worker: FFmpeg, ffprobe, libvips (with librsvg for the watermark), HEIF.
# Polls the Asset table in PostgreSQL; no inbound ports.
FROM node:24-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg libvips-tools libheif1 libimage-exiftool-perl libraw-bin poppler-utils file ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# Font for the watermark wordmark
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/prisma packages/db/prisma
RUN npm ci --workspace @loci/db --workspace @loci/worker --include-workspace-root=false --no-audit --no-fund

COPY packages/db packages/db
COPY apps/worker apps/worker
RUN npx prisma generate --schema packages/db/prisma/schema.prisma \
 && npm run build -w @loci/worker

RUN mkdir -p /work && chown node:node /work
ENV NODE_ENV=production
USER node
CMD ["node", "apps/worker/dist/main.js"]
