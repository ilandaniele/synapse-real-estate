import { copyFile, mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertSafeKey } from "./keys";
import type { ObjectStorage } from "./types";

/** Files under one directory; the API serves its public prefixes at /media/. */
export class LocalStorage implements ObjectStorage {
  readonly driver = "local" as const;
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** Absolute file path for a key; throws if the key escapes the root. */
  resolve(key: string): string {
    const full = path.resolve(this.root, assertSafeKey(key));
    if (!full.startsWith(this.root + path.sep)) throw new Error(`Storage key escapes the root: ${key}`);
    return full;
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async readHead(key: string, length: number): Promise<Buffer> {
    const handle = await open(this.resolve(key), "r");
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  async size(key: string): Promise<number | null> {
    try {
      return (await stat(this.resolve(key))).size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async write(key: string, body: Buffer): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    const target = this.resolve(toKey);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(this.resolve(fromKey), target);
  }

  async remove(key: string): Promise<void> {
    return rm(this.resolve(key), { force: true });
  }
}
