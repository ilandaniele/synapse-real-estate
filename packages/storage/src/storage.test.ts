import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertSafeKey, LocalStorage, S3Storage, storageFromEnv, type ObjectStorage } from "./index";

/** S3 tests run against a real S3-compatible server: `docker compose up -d s3` and S3_TEST_ENDPOINT=http://localhost:9000. */
const S3_TEST_ENDPOINT = process.env.S3_TEST_ENDPOINT;

function s3TestStorage(): S3Storage {
  return new S3Storage({
    bucket: `synapse-test-${randomUUID()}`,
    region: "us-east-1",
    endpoint: S3_TEST_ENDPOINT,
    accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID ?? "synapse",
    secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY ?? "synapse-dev-only",
    forcePathStyle: true,
  });
}

function contract(name: string, setup: () => Promise<ObjectStorage>) {
  describe(`${name} storage`, () => {
    let storage: ObjectStorage;
    beforeAll(async () => {
      storage = await setup();
    });

    it("writes, reads, sizes and removes an object", async () => {
      await storage.write("processed/org/a.bin", Buffer.from("hello world"), "application/octet-stream");
      expect((await storage.read("processed/org/a.bin")).toString()).toBe("hello world");
      expect(await storage.size("processed/org/a.bin")).toBe(11);
      await storage.remove("processed/org/a.bin");
      expect(await storage.size("processed/org/a.bin")).toBeNull();
    });

    it("reads only the first bytes", async () => {
      await storage.write("uploads/org/head", Buffer.from("0123456789"));
      expect((await storage.readHead("uploads/org/head", 4)).toString()).toBe("0123");
      expect((await storage.readHead("uploads/org/head", 100)).toString()).toBe("0123456789");
    });

    it("copies an object to another key", async () => {
      await storage.write("uploads/org/src", Buffer.from("copy me"));
      await storage.copy("uploads/org/src", "published/org/dst.jpg");
      expect((await storage.read("published/org/dst.jpg")).toString()).toBe("copy me");
    });

    it("rejects keys that escape the storage", async () => {
      await expect(storage.read("../secret")).rejects.toThrow(/Unsafe storage key/);
      await expect(storage.write("/abs", Buffer.from("x"))).rejects.toThrow(/Unsafe storage key/);
    });
  });
}

describe("assertSafeKey", () => {
  it.each(["", "/a", "a/../b", "..", "a\\b"])("rejects %j", (key) => {
    expect(() => assertSafeKey(key)).toThrow();
  });
  it("accepts nested relative keys", () => {
    expect(assertSafeKey("published/org/x.glb")).toBe("published/org/x.glb");
  });
});

describe("storageFromEnv", () => {
  it("defaults to local storage under the given directory", () => {
    const storage = storageFromEnv({}, "/tmp/x");
    expect(storage).toBeInstanceOf(LocalStorage);
  });
  it("builds S3 storage from S3_* variables", () => {
    const storage = storageFromEnv(
      { STORAGE_DRIVER: "s3", S3_BUCKET: "b", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s", S3_ENDPOINT: "http://localhost:9000" },
      "/tmp/x",
    );
    expect(storage).toBeInstanceOf(S3Storage);
  });
  it("fails fast when S3 credentials are missing", () => {
    expect(() => storageFromEnv({ STORAGE_DRIVER: "s3", S3_BUCKET: "b" }, "/tmp/x")).toThrow(/S3_ACCESS_KEY_ID/);
  });
});

let localRoot = "";
contract("local", async () => {
  localRoot = mkdtempSync(path.join(tmpdir(), "synapse-storage-test-"));
  return new LocalStorage(localRoot);
});
afterAll(() => {
  if (localRoot) rmSync(localRoot, { recursive: true, force: true });
});

describe.skipIf(!S3_TEST_ENDPOINT)("S3 (MinIO) presigned uploads", () => {
  const storage = s3TestStorage();
  beforeAll(async () => {
    await storage.client.send(new CreateBucketCommand({ Bucket: storage.bucket }));
  });

  it("accepts a PUT with the signed type and length", async () => {
    const body = Buffer.from("presigned body");
    const url = await storage.presignPut("uploads/org/p1", { contentType: "image/jpeg", size: body.length, expiresInSeconds: 60 });
    const res = await fetch(url, { method: "PUT", headers: { "content-type": "image/jpeg" }, body });
    expect(res.status).toBe(200);
    expect(await storage.size("uploads/org/p1")).toBe(body.length);
  });

  it("refuses a PUT whose length differs from the signed one", async () => {
    const url = await storage.presignPut("uploads/org/p2", { contentType: "image/jpeg", size: 4, expiresInSeconds: 60 });
    const res = await fetch(url, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: Buffer.from("much longer body") });
    expect(res.status).toBe(403);
    expect(await storage.size("uploads/org/p2")).toBeNull();
  });
});

if (S3_TEST_ENDPOINT) {
  contract("s3", async () => {
    const storage = s3TestStorage();
    await storage.client.send(new CreateBucketCommand({ Bucket: `${storage.bucket}` }));
    return storage;
  });
}
