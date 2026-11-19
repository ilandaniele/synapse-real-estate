import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const GOOGLE_JWKS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/** Google's signing keys, fetched on demand and cached by jose. */
export const googleSigningKeys = (): JWTVerifyGetKey => createRemoteJWKSet(GOOGLE_JWKS_URL, { timeoutDuration: 5000 });

/** The verified, lowercased email of a Google ID token issued to `clientId`; null for any invalid token. */
export async function verifiedGoogleEmail(credential: string, clientId: string, keys: JWTVerifyGetKey): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(credential, keys, { issuer: GOOGLE_ISSUERS, audience: clientId, algorithms: ["RS256"] });
    if (payload.email_verified !== true || typeof payload.email !== "string") return null;
    return payload.email.trim().toLowerCase();
  } catch {
    return null;
  }
}
