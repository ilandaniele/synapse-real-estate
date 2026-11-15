import { ApiError } from "@synapse/contracts";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const PREFIX = `${API_URL}/api/v1`;

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface RequestOptions {
  method?: Method;
  body?: unknown;
  signal?: AbortSignal;
}

/** Turns a non-2xx response into an `ApiRequestError`, parsing the `ApiError` envelope when present. */
export async function toApiError(response: Response): Promise<ApiRequestError> {
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    // not JSON
  }
  const envelope = ApiError.safeParse(parsed);
  if (envelope.success) {
    const { code, message, details } = envelope.data.error;
    return new ApiRequestError(response.status, code, message, details);
  }
  return new ApiRequestError(response.status, "HTTP_ERROR", `Error ${response.status} del servidor`);
}

/** Typed JSON request against `/api/v1` with the session cookie. 204/empty bodies resolve to `undefined`. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;
  let response: Response;
  try {
    response = await fetch(`${PREFIX}${path}`, {
      method,
      credentials: "include",
      signal,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiRequestError(0, "NETWORK_ERROR", "No se pudo conectar con el servidor.");
  }
  if (!response.ok) throw await toApiError(response);
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Authenticated download (e.g. CSV): fetch with credentials, then hand the blob to the browser. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${PREFIX}${path}`, { credentials: "include" });
  } catch {
    throw new ApiRequestError(0, "NETWORK_ERROR", "No se pudo conectar con el servidor.");
  }
  if (!response.ok) throw await toApiError(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface DetailLine {
  path?: string;
  message: string;
}

/** Normalizes `ApiError.details` (zod issues, manifest issues, strings...) into displayable lines. */
export function detailLines(details: unknown): DetailLine[] {
  if (!Array.isArray(details)) return [];
  return details.flatMap((item): DetailLine[] => {
    if (typeof item === "string") return [{ message: item }];
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const rawPath = record.path;
      const path = Array.isArray(rawPath) ? rawPath.join(".") : typeof rawPath === "string" ? rawPath : undefined;
      const message = typeof record.message === "string" ? record.message : JSON.stringify(item);
      return [{ path: path || undefined, message }];
    }
    return [];
  });
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return "Error inesperado";
}
