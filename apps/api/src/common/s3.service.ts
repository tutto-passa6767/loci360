import { Injectable } from '@nestjs/common';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  Part,
  S3Client,
  S3ClientConfig,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { cfg } from '../config';

const clientConfig = (endpoint: string): S3ClientConfig => ({
  endpoint,
  region: cfg.s3.region,
  forcePathStyle: true,
  credentials: { accessKeyId: cfg.s3.accessKey, secretAccessKey: cfg.s3.secretKey },
  // Browsers cannot compute SDK checksums for presigned URLs — only send them when required
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

@Injectable()
export class S3Service {
  /** Client for calls from inside the network */
  readonly internal = new S3Client(clientConfig(cfg.s3.endpoint));
  /** Client that signs URLs the browser uses (storage address as seen from outside) */
  readonly public = new S3Client(clientConfig(cfg.s3.publicEndpoint));

  readonly originals = cfg.s3.originals;
  readonly media = cfg.s3.media;

  /** Public URL of a processed file (media bucket or the CDN in front of it) */
  mediaUrl(key: string) {
    return `${cfg.mediaUrl}/${key}`;
  }

  async createMultipart(key: string): Promise<string> {
    const res = await this.internal.send(
      new CreateMultipartUploadCommand({ Bucket: this.originals, Key: key, ContentType: 'application/octet-stream' }),
    );
    if (!res.UploadId) throw new Error('Storage returned no UploadId');
    return res.UploadId;
  }

  presignUploadPart(key: string, uploadId: string, partNumber: number, ttlSec: number) {
    return getSignedUrl(
      this.public,
      new UploadPartCommand({ Bucket: this.originals, Key: key, UploadId: uploadId, PartNumber: partNumber }),
      { expiresIn: ttlSec },
    );
  }

  /** Every part the storage has accepted (paginated) */
  async listParts(key: string, uploadId: string): Promise<Part[]> {
    const parts: Part[] = [];
    let marker: string | undefined;
    do {
      const res = await this.internal.send(
        new ListPartsCommand({ Bucket: this.originals, Key: key, UploadId: uploadId, PartNumberMarker: marker, MaxParts: 1000 }),
      );
      parts.push(...(res.Parts ?? []));
      marker = res.IsTruncated ? res.NextPartNumberMarker : undefined;
    } while (marker);
    return parts.sort((a, b) => (a.PartNumber ?? 0) - (b.PartNumber ?? 0));
  }

  async completeMultipart(key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[]) {
    await this.internal.send(
      new CompleteMultipartUploadCommand({ Bucket: this.originals, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts } }),
    );
  }

  async abortMultipart(key: string, uploadId: string) {
    try {
      await this.internal.send(new AbortMultipartUploadCommand({ Bucket: this.originals, Key: key, UploadId: uploadId }));
    } catch (e: any) {
      if (e?.name !== 'NoSuchUpload') throw e;
    }
  }

  async headOriginal(key: string): Promise<{ size: number } | null> {
    try {
      const res = await this.internal.send(new HeadObjectCommand({ Bucket: this.originals, Key: key }));
      return { size: Number(res.ContentLength ?? 0) };
    } catch (e: any) {
      if (e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }

  /** Signed download link for an original (editors only) */
  presignOriginal(key: string, filename: string, ttlSec: number) {
    const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    return getSignedUrl(
      this.public,
      new GetObjectCommand({
        Bucket: this.originals,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      }),
      { expiresIn: ttlSec },
    );
  }

  /** Reads a processed file into memory (images for PDF spec sheets) */
  async getMediaBuffer(key: string): Promise<Buffer | null> {
    try {
      const res = await this.internal.send(new GetObjectCommand({ Bucket: this.media, Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (e: any) {
      if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }

  async deleteObject(bucket: string, key: string) {
    await this.internal.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: [{ Key: key }], Quiet: true } }));
  }

  async deletePrefix(bucket: string, prefix: string) {
    let token: string | undefined;
    do {
      const res = await this.internal.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
      const keys = (res.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (keys.length) {
        await this.internal.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }));
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
  }
}
