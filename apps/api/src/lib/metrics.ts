import { createHash, timingSafeEqual } from "node:crypto";
import { count } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { importJobs, renderJobs, type Db } from "@synapse/db";
import { JOB_STATUSES } from "@synapse/domain";
import { unauthorized } from "./errors";
import { Histogram, PROMETHEUS_CONTENT_TYPE, family, processMetrics } from "./prometheus";

const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Constant-time check of an `Authorization: Bearer <token>` header. */
export function bearerMatches(header: string | undefined, token: string): boolean {
  const given = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  return timingSafeEqual(digest(given), digest(token));
}

async function jobMetrics(db: Db): Promise<string> {
  const [imports, renders] = await Promise.all([
    db.select({ status: importJobs.status, n: count() }).from(importJobs).groupBy(importJobs.status),
    db.select({ status: renderJobs.status, n: count() }).from(renderJobs).groupBy(renderJobs.status),
  ]);
  const samples = Object.entries({ IMPORT: imports, RENDER: renders }).flatMap(([kind, rows]) =>
    JOB_STATUSES.map((status) => ({ labels: { kind, status }, value: rows.find((r) => r.status === status)?.n ?? 0 })),
  );
  return family("synapse_jobs", "gauge", "Import and render jobs by status, across all organizations", samples);
}

/** Prometheus metrics at GET /metrics, behind a bearer token. Without a token nothing is collected or exposed. */
export function registerMetrics(app: FastifyInstance, token: string | undefined) {
  if (!token) return;
  const httpDuration = new Histogram("http_request_duration_seconds", "HTTP request duration by method, route pattern and status code", DURATION_BUCKETS);

  app.addHook("onResponse", async (request, reply) => {
    const route = request.routeOptions.url ?? "unmatched";
    if (route === "/metrics") return;
    httpDuration.observe({ method: request.method, route, status_code: reply.statusCode }, reply.elapsedTime / 1000);
  });

  app.get("/metrics", async (request, reply) => {
    if (!bearerMatches(request.headers.authorization, token)) throw unauthorized("Invalid metrics token");
    const body = [httpDuration.render(), await jobMetrics(app.db), processMetrics()].join("\n");
    return reply.type(PROMETHEUS_CONTENT_TYPE).send(`${body}\n`);
  });
}
