import { randomBytes } from "node:crypto";
import path from "node:path";
import { REPO_ROOT } from "@synapse/db";
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.string().default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().default(""),
  SESSION_SECRET: z.string().optional(),
  STORAGE_DIR: z.string().default("./storage"),
  // Empty means relative /media and /api URLs, for a proxy that serves the API on each app's own origin.
  PUBLIC_API_URL: z.union([z.literal(""), z.string().url()]).default("http://localhost:4000"),
  // Public base for media (a CDN in front of the bucket or of /media). Empty means `${PUBLIC_API_URL}/media`.
  MEDIA_PUBLIC_URL: z.union([z.literal(""), z.string().url()]).default(""),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:3001"),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
  // Bearer token for GET /metrics. Empty disables the endpoint.
  METRICS_TOKEN: z.union([z.literal(""), z.string().min(24)]).default(""),
  // smtp:// or smtps:// URL. Empty: emails are logged outside production and disabled in production.
  SMTP_URL: z.union([z.literal(""), z.string().regex(/^smtps?:\/\//)]).default(""),
  MAIL_FROM: z.string().min(3).default("Synapse <no-reply@synapse.local>"),
  // Base of the links sent by email (invitations, password reset).
  ADMIN_PUBLIC_URL: z.union([z.literal(""), z.string().url()]).default(""),
  // Logins, invitation accepts and password resets per IP per minute.
  LOGIN_RATE_LIMIT: z.coerce.number().int().min(1).max(1000).default(10),
});

export interface Config {
  isProd: boolean;
  port: number;
  databaseUrl: string;
  sessionSecret: string;
  storageDir: string;
  publicApiUrl: string;
  mediaBaseUrl: string;
  corsOrigins: string[];
  trustProxy: boolean;
  metricsToken?: string;
  smtpUrl?: string;
  mailFrom: string;
  adminPublicUrl: string;
  loginRateLimit: number;
}

export const defaultMediaBaseUrl = (publicApiUrl: string) => `${publicApiUrl}/media`;

export function loadConfig(env: NodeJS.ProcessEnv = process.env, warn: (message: string) => void = console.warn): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${detail}`);
  }
  const e = parsed.data;
  const isProd = e.NODE_ENV === "production";
  let secret = e.SESSION_SECRET?.trim();
  if (isProd) {
    if (!secret || secret.length < 32) throw new Error("SESSION_SECRET is required in production and must be at least 32 characters");
    if (secret.startsWith("change-me")) throw new Error("SESSION_SECRET still has the .env.example placeholder value");
  } else if (!secret || secret.length < 32) {
    secret = randomBytes(32).toString("hex");
    warn("[api] SESSION_SECRET missing or shorter than 32 chars: using a random per-process secret (sessions reset on restart).");
  }
  const publicApiUrl = e.PUBLIC_API_URL.replace(/\/+$/, "");
  if (isProd && e.SMTP_URL && !e.ADMIN_PUBLIC_URL) throw new Error("ADMIN_PUBLIC_URL is required in production when SMTP_URL is set");
  return {
    isProd,
    port: e.API_PORT,
    databaseUrl: e.DATABASE_URL,
    sessionSecret: secret,
    storageDir: path.resolve(REPO_ROOT, e.STORAGE_DIR),
    publicApiUrl,
    mediaBaseUrl: e.MEDIA_PUBLIC_URL.replace(/\/+$/, "") || defaultMediaBaseUrl(publicApiUrl),
    corsOrigins: e.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
    trustProxy: e.TRUST_PROXY === "true",
    metricsToken: e.METRICS_TOKEN || undefined,
    smtpUrl: e.SMTP_URL || undefined,
    mailFrom: e.MAIL_FROM,
    adminPublicUrl: (e.ADMIN_PUBLIC_URL || "http://localhost:3001").replace(/\/+$/, ""),
    loginRateLimit: e.LOGIN_RATE_LIMIT,
  };
}
