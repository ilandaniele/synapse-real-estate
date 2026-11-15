import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import type { Db } from "@synapse/db";
import { loadConfig, type Config } from "./config";
import { decorateAuth } from "./lib/auth";
import { errorHandler, notFoundHandler } from "./lib/errors";
import { buildOpenApiDocument } from "./lib/openapi";
import authRoutes from "./routes/auth";
import publicRoutes from "./routes/public";
import { assetAdminRoutes, uploadRoutes } from "./routes/admin/assets";
import contentRoutes from "./routes/admin/content";
import dashboardRoutes from "./routes/admin/dashboard";
import developmentRoutes from "./routes/admin/developments";
import jobRoutes from "./routes/admin/jobs";
import leadRoutes from "./routes/admin/leads";
import sceneRoutes from "./routes/admin/scenes";
import unitRoutes from "./routes/admin/units";

export interface BuildAppOptions {
  db: Db;
  storageDir: string;
  config?: Partial<Omit<Config, "storageDir">>;
  /** Per-IP requests/minute. Defaults: global 300, login 10, leads 5. */
  rateLimit?: { global?: number; login?: number; leads?: number };
  logger?: boolean;
}

const TEST_SECRET = "dev-only-secret-dev-only-secret-0123456789";
const MEDIA_CACHE = "public, max-age=604800, stale-while-revalidate=86400";

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const config: Config = {
    isProd: false,
    port: 4000,
    databaseUrl: "",
    sessionSecret: TEST_SECRET,
    publicApiUrl: "http://localhost:4000",
    corsOrigins: ["http://localhost:3000", "http://localhost:3001"],
    trustProxy: false,
    ...options.config,
    storageDir: options.storageDir,
  };
  const limits = { global: 300, login: 10, leads: 5, ...options.rateLimit };

  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 1024 * 1024,
    trustProxy: config.trustProxy,
    // Rows are validated with Zod; Fastify's own validation/serialisation stays out of the way.
  });
  app.decorate("db", options.db);
  app.decorate("config", config);
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
    allowList: (request) => request.url.startsWith("/media/") || request.url === "/health",
    errorResponseBuilder: (_request, context) =>
      Object.assign(new Error(`Too many requests. Retry in ${Math.ceil(context.ttl / 1000)} s.`), { statusCode: 429 }),
  });

  await app.register(swagger, {
    mode: "static",
    specification: { document: buildOpenApiDocument(config.publicApiUrl) as never },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  await app.register(fastifyStatic, {
    root: options.storageDir,
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

  app.get("/health", async () => ({ status: "ok" as const }));

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
          await admin.register(contentRoutes);
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
