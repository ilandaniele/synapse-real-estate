import { ApiError } from "@synapse/contracts";
import { FILE_KINDS, MAX_UPLOAD_BYTES, MIME_BY_KIND, type FileKind } from "@synapse/domain";
import { ApiRequestError } from "./api";

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
