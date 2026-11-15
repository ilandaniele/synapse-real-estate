export const DEFAULT_SEED_PASSWORD = "demo-password-123";
export const PRODUCTION_OPT_IN = "wipe-database";
const MIN_PRODUCTION_PASSWORD = 16;

/**
 * The demo seed wipes the demo organizations. Outside production it falls back to a known local password.
 * In production it only runs with SEED_ALLOW_PRODUCTION=wipe-database and a strong SEED_PASSWORD.
 */
export function seedPassword(env: NodeJS.ProcessEnv): string {
  const password = env.SEED_PASSWORD?.trim() ?? "";
  if (env.NODE_ENV !== "production") return password || DEFAULT_SEED_PASSWORD;
  if (env.SEED_ALLOW_PRODUCTION !== PRODUCTION_OPT_IN) {
    throw new Error(`The demo seed wipes data; in production set SEED_ALLOW_PRODUCTION=${PRODUCTION_OPT_IN} to run it.`);
  }
  if (password.length < MIN_PRODUCTION_PASSWORD || password === DEFAULT_SEED_PASSWORD) {
    throw new Error(`In production SEED_PASSWORD must be at least ${MIN_PRODUCTION_PASSWORD} characters and not the demo default.`);
  }
  return password;
}
