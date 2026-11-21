import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const GOOGLE_JWKS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/** Google's signing keys, fetched on demand and cached by jose. */
export const googleSigningKeys = (): JWTVerifyGetKey => createRemoteJWKSet(GOOGLE_JWKS_URL, { timeoutDuration: 5000 });

export interface GoogleProfile {
  email: string;
  name: string | null;
}

/** The verified, lowercased email and display name of a Google ID token issued to `clientId`; null for any invalid token. */
export async function verifiedGoogleProfile(credential: string, clientId: string, keys: JWTVerifyGetKey): Promise<GoogleProfile | null> {
  try {
    const { payload } = await jwtVerify(credential, keys, { issuer: GOOGLE_ISSUERS, audience: clientId, algorithms: ["RS256"] });
    if (payload.email_verified !== true || typeof payload.email !== "string") return null;
    const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim().slice(0, 120) : null;
    return { email: payload.email.trim().toLowerCase(), name };
  } catch {
    return null;
  }
}

export async function verifiedGoogleEmail(credential: string, clientId: string, keys: JWTVerifyGetKey): Promise<string | null> {
  return (await verifiedGoogleProfile(credential, clientId, keys))?.email ?? null;
}
