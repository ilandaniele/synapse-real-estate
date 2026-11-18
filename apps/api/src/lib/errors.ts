import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Authentication required") => new HttpError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You do not have permission to perform this action") => new HttpError(403, "FORBIDDEN", message);
export const notFound = (what = "Resource") => new HttpError(404, "NOT_FOUND", `${what} not found`);
export const conflict = (message: string, code = "CONFLICT") => new HttpError(409, code, message);
export const serviceUnavailable = (message: string) => new HttpError(503, "SERVICE_UNAVAILABLE", message);

/** Postgres unique violation (23505), whether raised directly or wrapped by drizzle. */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

function send(reply: FastifyReply, status: number, code: string, message: string, details?: unknown) {
  return reply.status(status).send({ error: { code, message, ...(details === undefined ? {} : { details }) } });
}

export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof HttpError) return send(reply, error.status, error.code, error.message, error.details);
  if (error instanceof ZodError) {
    const details = error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return send(reply, 400, "VALIDATION_ERROR", "Request validation failed", details);
  }
  const status = (error as FastifyError).statusCode;
  if (status && status >= 400 && status < 500) {
    const code = status === 429 ? "RATE_LIMITED" : status === 413 ? "PAYLOAD_TOO_LARGE" : (error as FastifyError).code ?? "BAD_REQUEST";
    return send(reply, status, code, error.message);
  }
  request.log.error({ err: error }, "unhandled error");
  return send(reply, 500, "INTERNAL_ERROR", "Internal server error");
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply) {
  return send(reply, 404, "NOT_FOUND", `Route ${request.method} ${request.url.split("?")[0]} not found`);
}
