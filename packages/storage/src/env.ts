import { z } from "zod";
import { LocalStorage } from "./local";
import { S3Storage } from "./s3";

const StorageEnv = z.discriminatedUnion("STORAGE_DRIVER", [
  z.object({ STORAGE_DRIVER: z.literal("local") }),
  z.object({
    STORAGE_DRIVER: z.literal("s3"),
    S3_BUCKET: z.string().min(1),
    S3_REGION: z.string().min(1).default("auto"),
    S3_ENDPOINT: z.union([z.literal(""), z.string().url()]).default(""),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
  }),
]);

/** Builds the storage from STORAGE_DRIVER (default local, rooted at `storageDir`) and the S3_* variables. */
export function storageFromEnv(env: NodeJS.ProcessEnv, storageDir: string): LocalStorage | S3Storage {
  const parsed = StorageEnv.safeParse({ ...env, STORAGE_DRIVER: env.STORAGE_DRIVER?.trim() || "local" });
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid storage configuration: ${detail}`);
  }
  const e = parsed.data;
  if (e.STORAGE_DRIVER === "local") return new LocalStorage(storageDir);
  return new S3Storage({
    bucket: e.S3_BUCKET,
    region: e.S3_REGION,
    endpoint: e.S3_ENDPOINT || undefined,
    accessKeyId: e.S3_ACCESS_KEY_ID,
    secretAccessKey: e.S3_SECRET_ACCESS_KEY,
    forcePathStyle: e.S3_FORCE_PATH_STYLE === "true",
  });
}
