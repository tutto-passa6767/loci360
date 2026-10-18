#!/bin/sh
# Buckets for LOCI360:
#   ORIGINALS — private; masters uploaded by editors (presigned multipart upload)
#   MEDIA     — anonymous read; HLS, posters, photo sizes. In production a CDN sits in front of it.
set -e
mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
mc mb --ignore-existing "local/$ORIGINALS"
mc mb --ignore-existing "local/$MEDIA"
mc anonymous set download "local/$MEDIA"
echo "buckets ready: $ORIGINALS (private), $MEDIA (public read)"
