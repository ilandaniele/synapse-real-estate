import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertSafeKey } from "./keys";
import type { ObjectStorage, PresignedPut } from "./types";

export interface S3Settings {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

const REQUEST_TIMEOUT_MS = 30_000;

const isNotFound = (error: unknown) =>
  error instanceof S3ServiceException && (error.$metadata.httpStatusCode === 404 || error.name === "NotFound" || error.name === "NoSuchKey");

/** S3-compatible bucket (AWS S3, Cloudflare R2, MinIO). Public prefixes are served by a CDN in front of the bucket. */
export class S3Storage implements ObjectStorage {
  readonly driver = "s3" as const;
  readonly bucket: string;
  readonly client: S3Client;

  constructor(settings: S3Settings) {
    this.bucket = settings.bucket;
    this.client = new S3Client({
      region: settings.region,
      endpoint: settings.endpoint,
      forcePathStyle: settings.forcePathStyle,
      credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
      requestHandler: { requestTimeout: REQUEST_TIMEOUT_MS },
    });
  }

  private async get(key: string, range?: string): Promise<Buffer> {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(key), Range: range }));
    if (!out.Body) return Buffer.alloc(0);
    return Buffer.from(await out.Body.transformToByteArray());
  }

  async read(key: string): Promise<Buffer> {
    return this.get(key);
  }

  async readHead(key: string, length: number): Promise<Buffer> {
    if (length <= 0) return Buffer.alloc(0);
    return (await this.get(key, `bytes=0-${length - 1}`)).subarray(0, length);
  }

  async size(key: string): Promise<number | null> {
    try {
      const out = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(key) }));
      return out.ContentLength ?? 0;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async write(key: string, body: Buffer, contentType?: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(key), Body: body, ContentType: contentType }));
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    const source = `${this.bucket}/${encodeURI(assertSafeKey(fromKey))}`;
    await this.client.send(new CopyObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(toKey), CopySource: source }));
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(key) }));
  }

  /** Presigned PUT; content type and length are signed, so the client cannot change them. */
  presignPut(key: string, options: PresignedPut): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: assertSafeKey(key),
      ContentType: options.contentType,
      ContentLength: options.size,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: options.expiresInSeconds,
      signableHeaders: new Set(["content-type", "content-length"]),
    });
  }
}
