export interface PresignedPut {
  contentType: string;
  size: number;
  expiresInSeconds: number;
}

/** Minimal object store used by the API and workers. Keys are relative paths such as `uploads/<org>/<id>`. */
export interface ObjectStorage {
  readonly driver: "local" | "s3";
  read(key: string): Promise<Buffer>;
  /** First `length` bytes (fewer if the object is smaller). */
  readHead(key: string, length: number): Promise<Buffer>;
  /** Size in bytes, or null when the object does not exist. */
  size(key: string): Promise<number | null>;
  write(key: string, body: Buffer, contentType?: string): Promise<void>;
  copy(fromKey: string, toKey: string): Promise<void>;
  remove(key: string): Promise<void>;
}
