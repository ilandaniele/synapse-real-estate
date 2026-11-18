import type { z } from "zod";
import { ApiError, type UploadTicket } from "@synapse/contracts";
import { FILE_KINDS, MAX_UPLOAD_BYTES, MIME_BY_KIND, type FileKind } from "@synapse/domain";
import { api, ApiRequestError } from "./api";

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

export const ACCEPTED_EXTENSIONS = Object.keys(EXTENSION_KIND)
  .map((ext) => `.${ext}`)
  .join(",");

export const kindFromFilename = (filename: string): FileKind | null => {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const kind = EXTENSION_KIND[ext];
  return kind && FILE_KINDS.includes(kind) ? kind : null;
};

export interface ClientValidation {
  ok: boolean;
  kind?: FileKind;
  message?: string;
}

/** Cheap pre-flight checks; the API repeats them and also verifies magic bytes. */
export function validateFileForUpload(file: File): ClientValidation {
  const kind = kindFromFilename(file.name);
  if (!kind) return { ok: false, message: `Extensión no admitida. Formatos: ${ACCEPTED_EXTENSIONS.replaceAll(",", " ")}` };
  if (file.size === 0) return { ok: false, message: "El archivo está vacío." };
  const max = MAX_UPLOAD_BYTES[kind];
  if (file.size > max) return { ok: false, message: `El archivo supera el límite de ${max / (1024 * 1024)} MB para ${kind.toUpperCase()}.` };
  return { ok: true, kind };
}

export const contentTypeFor = (file: File, kind: FileKind): string => file.type || MIME_BY_KIND[kind];

/** Raw PUT with progress (fetch has no upload progress). Rejects with `ApiRequestError`. */
export function putWithProgress(url: string, file: File, contentType: string, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new ApiRequestError(0, "NETWORK_ERROR", "Falló la subida: no se pudo conectar con el servidor."));
    xhr.onabort = () => reject(new ApiRequestError(0, "ABORTED", "Subida cancelada."));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
        return;
      }
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(xhr.responseText);
      } catch {
        // not JSON
      }
      const envelope = ApiError.safeParse(parsed);
      if (envelope.success) {
        const { code, message, details } = envelope.data.error;
        reject(new ApiRequestError(xhr.status, code, message, details));
      } else {
        reject(new ApiRequestError(xhr.status, "HTTP_ERROR", `Error ${xhr.status} durante la subida`));
      }
    };
    xhr.send(file);
  });
}

/** Validates, requests an upload ticket, PUTs the file and confirms it when the ticket asks. Resolves with the new asset id. */
export async function uploadAsset(file: File, onProgress: (fraction: number) => void): Promise<string> {
  const check = validateFileForUpload(file);
  if (!check.ok || !check.kind) throw new Error(check.message ?? "Archivo no válido");
  const contentType = contentTypeFor(file, check.kind);
  onProgress(0);
  const ticket = await api<z.infer<typeof UploadTicket>>("/admin/assets/uploads", {
    method: "POST",
    body: { filename: file.name, size: file.size, contentType },
  });
  await putWithProgress(ticket.uploadUrl, file, contentType, onProgress);
  if (ticket.requiresCompletion) await api(`/admin/assets/${ticket.assetId}/complete`, { method: "POST" });
  return ticket.assetId;
}

const IMAGE_KINDS: readonly FileKind[] = ["jpeg", "png", "webp", "svg"];
export const IMAGE_EXTENSIONS = ".jpg,.jpeg,.png,.webp,.svg";

export function validateImageForUpload(file: File): ClientValidation {
  const check = validateFileForUpload(file);
  if (check.ok && check.kind && !IMAGE_KINDS.includes(check.kind)) return { ok: false, message: "Elige una imagen JPG, PNG, WebP o SVG." };
  return check;
}

export function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image.naturalWidth > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}
