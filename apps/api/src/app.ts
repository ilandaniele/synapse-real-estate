import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import type { Db } from "@synapse/db";
import { LocalStorage, type ObjectStorage } from "@synapse/storage";
import { defaultMediaBaseUrl, loadConfig, type Config } from "./config";
import { decorateAuth } from "./lib/auth";
import { errorHandler, forbidden, notFoundHandler } from "./lib/errors";
import { registerMetrics } from "./lib/metrics";
import { buildOpenApiDocument } from "./lib/openapi";
import authRoutes from "./routes/auth";
import healthRoutes from "./routes/health";
import publicRoutes from "./routes/public";
import { assetAdminRoutes, uploadRoutes } from "./routes/admin/assets";
import dashboardRoutes from "./routes/admin/dashboard";
import developmentRoutes from "./routes/admin/developments";
import floorPlanRoutes from "./routes/admin/floor-plans";
import galleryRoutes from "./routes/admin/gallery";
import jobRoutes from "./routes/admin/jobs";
import leadRoutes from "./routes/admin/leads";
import memberRoutes from "./routes/admin/members";
import pointOfInterestRoutes from "./routes/admin/points-of-interest";
import sceneRoutes from "./routes/admin/scenes";
import unitRoutes from "./routes/admin/units";

export interface BuildAppOptions {
  db: Db;
  storageDir: string;
  config?: Partial<Omit<Config, "storageDir">>;
  /** Defaults to files under `storageDir`, served by the API at /media/. */
  storage?: ObjectStorage;
  /** Per-IP requests/minute. Defaults: global 300, login 10, leads 5. */
  rateLimit?: { global?: number; login?: number; leads?: number };
  logger?: boolean;
}

const TEST_SECRET = "dev-only-secret-dev-only-secret-0123456789";
const MEDIA_CACHE = "public, max-age=604800, stale-while-revalidate=86400";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Upload URLs carry a signed token in the query string; keep it out of the logs. */
function redactedRequest(request: FastifyRequest) {
  return { method: request.method, url: request.url.replace(/([?&]token=)[^&]*/g, "$1[REDACTED]"), reqId: request.id };
}

/** Serves public prefixes of local storage; with S3 a CDN in front of the bucket serves them instead. */
async function registerLocalMedia(app: FastifyInstance, root: string) {
  await app.register(fastifyStatic, {
    root,
    prefix: "/media/",
    // Raw uploads (CAD files, unprocessed panoramas) are private; processed/published/demo outputs are public.
    allowedPath: (pathName) => !pathName.startsWith("/uploads"),
    dotfiles: "deny",
    index: false,
    list: false,
    setHeaders(reply, filePath) {
      reply.header("Cross-Origin-Resource-Policy", "cross-origin");
      reply.header("Cache-Control", MEDIA_CACHE);
      if (filePath.toLowerCase().endsWith(".svg")) {
        reply.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      }
    },
  });
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const publicApiUrl = options.config?.publicApiUrl ?? "http://localhost:4000";
  const config: Config = {
    isProd: false,
    port: 4000,
    databaseUrl: "",
    sessionSecret: TEST_SECRET,
    publicApiUrl,
    mediaBaseUrl: defaultMediaBaseUrl(publicApiUrl),
    corsOrigins: ["http://localhost:3000", "http://localhost:3001"],
    trustProxy: false,
    ...options.config,
    storageDir: options.storageDir,
  };
  const limits = { global: 300, login: 10, leads: 5, ...options.rateLimit };

  const app = Fastify({
    logger: options.logger ? { serializers: { req: redactedRequest } } : false,
    bodyLimit: 1024 * 1024,
    trustProxy: config.trustProxy,
    // Rows are validated with Zod; Fastify's own validation/serialisation stays out of the way.
  });
  app.decorate("db", options.db);
  app.decorate("config", config);
  const storage = options.storage ?? new LocalStorage(options.storageDir);
  app.decorate("storage", storage);
  decorateAuth(app);
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  app.addHook("onSend", async (request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    if (request.url.startsWith("/docs")) return; // swagger-ui ships its own CSP and needs framing rules off
    reply.header("X-Frame-Options", "DENY");
    reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  });

  // CSRF defence in depth on top of SameSite=Lax: browsers always send Origin on cross-site writes.
  app.addHook("onRequest", async (request) => {
    const origin = request.headers.origin;
    if (SAFE_METHODS.has(request.method) || !origin) return;
    if (!config.corsOrigins.includes(origin)) throw forbidden("Origin not allowed");
  });

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: limits.global,
    timeWindow: "1 minute",
    allowList: (request) => request.url.startsWith("/media/") || request.url.startsWith("/health"),
    errorResponseBuilder: (_request, context) =>
      Object.assign(new Error(`Too many requests. Retry in ${Math.ceil(context.ttl / 1000)} s.`), { statusCode: 429 }),
  });

  if (!config.isProd) {
    await app.register(swagger, {
      mode: "static",
      specification: { document: buildOpenApiDocument(config.publicApiUrl) as never },
    });
    await app.register(swaggerUi, { routePrefix: "/docs" });
  }

  if (storage instanceof LocalStorage) await registerLocalMedia(app, storage.root);

  await app.register(healthRoutes);
  registerMetrics(app, config.metricsToken);

  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: "/auth", loginRateLimit: limits.login });
      await api.register(publicRoutes, { prefix: "/public", leadRateLimit: limits.leads });
      await api.register(uploadRoutes);
      await api.register(
        async (admin) => {
          await admin.register(developmentRoutes);
          await admin.register(unitRoutes);
          await admin.register(sceneRoutes);
          await admin.register(floorPlanRoutes);
          await admin.register(galleryRoutes);
          await admin.register(pointOfInterestRoutes);
          await admin.register(memberRoutes);
          await admin.register(leadRoutes);
          await admin.register(assetAdminRoutes);
          await admin.register(jobRoutes);
          await admin.register(dashboardRoutes);
        },
        { prefix: "/admin" },
      );
    },
    { prefix: "/api/v1" },
  );

  return app;
}

export { loadConfig };
