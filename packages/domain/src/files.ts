export const FILE_KINDS = ["glb", "gltf", "jpeg", "png", "webp", "dxf", "dwg", "ifc", "pdf", "svg", "obj", "fbx"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

const MB = 1024 * 1024;

export const MAX_UPLOAD_BYTES: Record<FileKind, number> = {
  glb: 200 * MB,
  gltf: 50 * MB,
  jpeg: 60 * MB,
  png: 80 * MB,
  webp: 60 * MB,
  dxf: 100 * MB,
  dwg: 100 * MB,
  ifc: 300 * MB,
  pdf: 50 * MB,
  svg: 5 * MB,
  obj: 200 * MB,
  fbx: 200 * MB,
};

export const MIME_BY_KIND: Record<FileKind, string> = {
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  dxf: "image/vnd.dxf",
  dwg: "image/vnd.dwg",
  ifc: "application/x-step",
  pdf: "application/pdf",
  svg: "image/svg+xml",
  obj: "model/obj",
  fbx: "application/octet-stream",
};

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((b, i) => bytes[offset + i] === b);

const asciiHead = (bytes: Uint8Array, length: number) =>
  String.fromCharCode(...bytes.subarray(0, Math.min(length, bytes.length)));

export function detectFileKind(bytes: Uint8Array): FileKind | null {
  if (startsWith(bytes, [0x67, 0x6c, 0x54, 0x46])) return "glb";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  const head = asciiHead(bytes, 512);
  if (/^AC10\d\d/.test(head)) return "dwg";
  if (head.startsWith("ISO-10303-21")) return "ifc";
  if (head.startsWith("Kaydara FBX Binary")) return "fbx";
  const trimmed = head.trimStart();
  if (/^0\s*\r?\n\s*SECTION/.test(trimmed)) return "dxf";
  if (/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(trimmed)) return "svg";
  if (trimmed.startsWith("{") && trimmed.includes('"asset"')) return "gltf";
  if (/^(#|v |o |mtllib )/m.test(trimmed)) return "obj";
  return null;
}

export type FileValidation = { ok: true; kind: FileKind } | { ok: false; reason: string };

export function validateUpload(bytes: Uint8Array, size: number, allowed: readonly FileKind[]): FileValidation {
  const kind = detectFileKind(bytes);
  if (!kind) return { ok: false, reason: "Unrecognized file signature" };
  if (!allowed.includes(kind)) return { ok: false, reason: `File type ${kind} is not allowed here` };
  if (size > MAX_UPLOAD_BYTES[kind]) return { ok: false, reason: `File exceeds ${MAX_UPLOAD_BYTES[kind] / MB} MB` };
  return { ok: true, kind };
}
