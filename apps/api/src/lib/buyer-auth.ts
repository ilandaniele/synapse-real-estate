import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { buyers } from "@synapse/db";
import { key, sessionCookieOptions } from "./auth";
import { unauthorized } from "./errors";

export const BUYER_COOKIE = "synapse_buyer";
const BUYER_TTL_SECONDS = 30 * 24 * 60 * 60;
const BUYER_AUDIENCE = "buyer";

export interface BuyerAccount {
  id: string;
  email: string;
  name: string;
}

declare module "fastify" {
  interface FastifyInstance {
    /** preHandler: authenticates the showroom buyer cookie. Staff sessions are not accepted. */
    requireBuyer: (request: FastifyRequest) => Promise<void>;
  }
  interface FastifyRequest {
    buyer: BuyerAccount | null;
  }
}

async function signBuyerSession(secret: string, buyerId: string): Promise<string> {
  return new SignJWT({ iatMs: Date.now() })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(buyerId)
    .setAudience(BUYER_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${BUYER_TTL_SECONDS}s`)
    .sign(key(secret));
}

async function verifyBuyerSession(secret: string, token: string): Promise<{ buyerId: string; issuedAtMs: number } | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"], audience: BUYER_AUDIENCE });
    if (!payload.sub || typeof payload.iatMs !== "number") return null;
    return { buyerId: payload.sub, issuedAtMs: payload.iatMs };
  } catch {
    return null;
  }
}

/** Sets the buyer cookie and returns the account fields the showroom shows. */
export async function startBuyerSession(app: FastifyInstance, reply: FastifyReply, buyer: BuyerAccount): Promise<BuyerAccount> {
  const token = await signBuyerSession(app.config.sessionSecret, buyer.id);
  reply.setCookie(BUYER_COOKIE, token, { ...sessionCookieOptions(app.config), maxAge: BUYER_TTL_SECONDS });
  reply.header("Cache-Control", "no-store");
  return { id: buyer.id, email: buyer.email, name: buyer.name };
}

export function decorateBuyerAuth(app: FastifyInstance) {
  app.decorateRequest("buyer", null);
  app.decorate("requireBuyer", async (request: FastifyRequest) => {
    const token = request.cookies[BUYER_COOKIE];
    const verified = token ? await verifyBuyerSession(app.config.sessionSecret, token) : null;
    if (!verified) throw unauthorized();
    const [row] = await app.db
      .select({ id: buyers.id, email: buyers.email, name: buyers.name, sessionsValidAfter: buyers.sessionsValidAfter })
      .from(buyers)
      .where(eq(buyers.id, verified.buyerId));
    if (!row || (row.sessionsValidAfter && verified.issuedAtMs < row.sessionsValidAfter.getTime())) {
      throw unauthorized("Session is no longer valid");
    }
    request.buyer = { id: row.id, email: row.email, name: row.name };
  });
}

/** The signed-in buyer; only valid on routes guarded by requireBuyer. */
export function currentBuyer(request: FastifyRequest): BuyerAccount {
  if (!request.buyer) throw unauthorized();
  return request.buyer;
}
