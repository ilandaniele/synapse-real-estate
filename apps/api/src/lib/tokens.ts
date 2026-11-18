import { createHash, randomBytes } from "node:crypto";

/** Single-use link tokens: the raw value goes in the email, only its sha256 is stored. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function newToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export const expiresIn = (ms: number) => new Date(Date.now() + ms);
