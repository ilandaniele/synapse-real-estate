import type { ZodError } from "zod";
import { ApiRequestError, detailLines } from "./api";

export type FieldErrors = Record<string, string>;

export function zodFieldErrors(error: ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}

/** Maps `VALIDATION_ERROR` details (`{path, message}`) from the API to per-field messages. */
export function apiFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ApiRequestError)) return {};
  const out: FieldErrors = {};
  for (const line of detailLines(error.details)) {
    if (line.path) out[line.path] ??= line.message;
  }
  return out;
}

export function parseNumber(value: string): number {
  const trimmed = value.trim().replace(",", ".");
  return trimmed === "" ? Number.NaN : Number(trimmed);
}
