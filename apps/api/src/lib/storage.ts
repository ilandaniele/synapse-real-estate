import { jwtVerify, SignJWT } from "jose";
import { FILE_KINDS, type FileKind } from "@synapse/domain";
import type { Config } from "../config";

export const UPLOAD_TOKEN_TTL_SECONDS = 600;

const key = (secret: string) => new TextEncoder().encode(secret);

/** Stored paths are storage keys (e.g. `processed/<org>/<id>.jpg`); external http(s) URLs are kept as-is. */
export function mediaUrl(config: Config, stored: string): string;
export function mediaUrl(config: Config, stored: string | null): string | null;
export function mediaUrl(config: Config, stored: string | null): string | null {
  if (!stored) return null;
  if (/^https?:\/\//i.test(stored)) return stored;
  return `${config.mediaBaseUrl}/${stored.replace(/^\/+/, "")}`;
}

/** Inverse of mediaUrl for client-provided URLs: returns a storage key or an external URL; null if unsafe. */
export function toStoredPath(config: Config, input: string): string | null {
  let value = input.trim();
  const prefix = `${config.mediaBaseUrl}/`;
  if (value.startsWith(prefix)) value = value.slice(prefix.length);
  else if (value.startsWith("/media/")) value = value.slice("/media/".length);
  else if (/^https:\/\//i.test(value)) return value;
  else if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  if (!value || value.includes("..") || value.includes("\\") || value.startsWith("/") || value.startsWith("uploads/")) return null;
  return value;
}

export const uploadPath = (organizationId: string, assetId: string) => `uploads/${organizationId}/${assetId}`;

const EXTENSION_KIND: Record<string, FileKind> = {
  glb: "glb",
  gltf: "gltf",
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
  dxf: "dxf",
  dwg: "dwg",
  ifc: "ifc",
  pdf: "pdf",
  svg: "svg",
  obj: "obj",
  fbx: "fbx",
};

export function kindFromFilename(filename: string): FileKind | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const kind = EXTENSION_KIND[ext];
  return kind && FILE_KINDS.includes(kind) ? kind : null;
}

export async function signUploadToken(config: Config, claims: { assetId: string; organizationId: string }): Promise<string> {
  return new SignJWT({ org: claims.organizationId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.assetId)
    .setAudience("upload")
    .setIssuedAt()
    .setExpirationTime(`${UPLOAD_TOKEN_TTL_SECONDS}s`)
    .sign(key(config.sessionSecret));
}

export async function verifyUploadToken(config: Config, token: string): Promise<{ assetId: string; organizationId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key(config.sessionSecret), { algorithms: ["HS256"], audience: "upload" });
    if (!payload.sub || typeof payload.org !== "string") return null;
    return { assetId: payload.sub, organizationId: payload.org };
  } catch {
    return null;
  }
}
