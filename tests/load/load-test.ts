/**
 * Zero-dependency HTTP load test. Runs CONCURRENCY workers for DURATION_S seconds against the public paths a
 * showroom visit loads, then prints status counts and latency percentiles per path. Exits 1 on any 5xx or
 * network error. 429 is counted, not failed: the API rate-limits each IP to 300 requests a minute outside /media.
 *
 *   node tests/load/load-test.ts            # BASE_URL=http://localhost:4000 CONCURRENCY=20 DURATION_S=20
 */
const BASE_URL = process.env.BASE_URL ?? "http://localhost:4000";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 20);
const DURATION_S = Number(process.env.DURATION_S ?? 20);
const SLUG = process.env.DEVELOPMENT_SLUG ?? "lomas-del-faro";

const PATHS = [
  "/health",
  `/api/v1/public/developments/${SLUG}/manifest`,
  "/media/demo/hero.jpg",
  "/media/demo/models/masterplan.glb",
];

interface PathStats {
  statuses: Map<string, number>;
  latenciesMs: number[];
}

const stats = new Map<string, PathStats>(PATHS.map((path) => [path, { statuses: new Map(), latenciesMs: [] }]));

async function hit(path: string) {
  const entry = stats.get(path)!;
  const started = performance.now();
  let status: string;
  try {
    const response = await fetch(BASE_URL + path, { signal: AbortSignal.timeout(10_000) });
    await response.arrayBuffer();
    status = String(response.status);
  } catch {
    status = "network-error";
  }
  entry.latenciesMs.push(performance.now() - started);
  entry.statuses.set(status, (entry.statuses.get(status) ?? 0) + 1);
}

async function worker(deadline: number, offset: number) {
  for (let i = offset; performance.now() < deadline; i++) await hit(PATHS[i % PATHS.length]!);
}

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;

const deadline = performance.now() + DURATION_S * 1000;
await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(deadline, i)));

let failures = 0;
let total = 0;
console.log(`${BASE_URL}, ${CONCURRENCY} workers, ${DURATION_S} s`);
for (const [path, { statuses, latenciesMs }] of stats) {
  const sorted = latenciesMs.sort((a, b) => a - b);
  total += sorted.length;
  for (const [status, count] of statuses) if (status === "network-error" || status.startsWith("5")) failures += count;
  const counts = [...statuses].map(([status, count]) => `${status}×${count}`).join(" ");
  const [p50, p95, p99] = [0.5, 0.95, 0.99].map((p) => percentile(sorted, p).toFixed(1));
  console.log(`${path}\n  ${counts}  p50 ${p50} ms  p95 ${p95} ms  p99 ${p99} ms`);
}
console.log(`${total} requests, ${(total / DURATION_S).toFixed(0)} req/s, ${failures} failures`);
process.exitCode = failures > 0 ? 1 : 0;

export {};
