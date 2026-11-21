import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { JWTVerifyGetKey } from "jose";
import { z } from "zod";
import { BuyerRegisterInput, GoogleLoginInput, LoginInput, Uuid, type BuyerProfile } from "@synapse/contracts";
import { buyerFavorites, buyers } from "@synapse/db";
import { BUYER_COOKIE, currentBuyer, startBuyerSession } from "../lib/buyer-auth";
import { favoriteUnitIds, isPublishedUnit, listFavorites } from "../lib/buyer-favorites";
import { conflict, notFound, unauthorized } from "../lib/errors";
import { googleSigningKeys, verifiedGoogleProfile } from "../lib/google";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "../lib/passwords";

export interface BuyerRouteOptions {
  loginRateLimit: number;
  /** Google's signing keys; tests pass local ones. */
  googleKeys?: JWTVerifyGetKey;
}

const UnitParams = z.object({ unitId: Uuid });
const accountColumns = { id: buyers.id, email: buyers.email, name: buyers.name };

export default async function buyerRoutes(app: FastifyInstance, opts: BuyerRouteOptions) {
  const credentialRateLimit = { rateLimit: { max: opts.loginRateLimit, timeWindow: "1 minute" } };

  app.post("/register", { config: credentialRateLimit }, async (request, reply) => {
    const input = BuyerRegisterInput.parse(request.body);
    const [created] = await app.db
      .insert(buyers)
      .values({ name: input.name, email: input.email.toLowerCase(), passwordHash: await hashPassword(input.password) })
      .onConflictDoNothing({ target: buyers.email })
      .returning(accountColumns);
    if (!created) throw conflict("This email cannot be registered", "EMAIL_UNAVAILABLE");
    reply.status(201);
    return startBuyerSession(app, reply, created);
  });

  app.post("/login", { config: credentialRateLimit }, async (request, reply) => {
    const input = LoginInput.parse(request.body);
    const [candidate] = await app.db
      .select({ ...accountColumns, passwordHash: buyers.passwordHash })
      .from(buyers)
      .where(eq(buyers.email, input.email.trim().toLowerCase()));
    const valid = await verifyPassword(input.password, candidate?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!valid || !candidate?.passwordHash) throw unauthorized("Invalid email or password");
    return startBuyerSession(app, reply, candidate);
  });

  const googleClientId = app.config.googleClientId;
  if (googleClientId) {
    const keys = opts.googleKeys ?? googleSigningKeys();
    app.post("/google", { config: credentialRateLimit }, async (request, reply) => {
      const { credential } = GoogleLoginInput.parse(request.body);
      const profile = await verifiedGoogleProfile(credential, googleClientId, keys);
      if (!profile) throw unauthorized("Invalid Google credential");
      const [account] = await app.db
        .insert(buyers)
        .values({ email: profile.email, name: profile.name ?? profile.email.split("@")[0]! })
        .onConflictDoUpdate({ target: buyers.email, set: { updatedAt: new Date() } })
        .returning(accountColumns);
      return startBuyerSession(app, reply, account!);
    });
  }

  app.post("/logout", async (_request, reply) => {
    reply.clearCookie(BUYER_COOKIE, { path: "/" });
    reply.header("Cache-Control", "no-store");
    return { ok: true };
  });

  app.get("/me", { preHandler: app.requireBuyer }, async (request, reply) => {
    const buyer = currentBuyer(request);
    reply.header("Cache-Control", "no-store");
    const profile: BuyerProfile = { ...buyer, favoriteUnitIds: await favoriteUnitIds(app.db, buyer.id) };
    return profile;
  });

  app.get("/favorites", { preHandler: app.requireBuyer }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return listFavorites(app.db, currentBuyer(request).id);
  });

  app.put("/favorites/:unitId", { preHandler: app.requireBuyer }, async (request, reply) => {
    const { unitId } = UnitParams.parse(request.params);
    if (!(await isPublishedUnit(app.db, unitId))) throw notFound("Unit");
    await app.db.insert(buyerFavorites).values({ buyerId: currentBuyer(request).id, unitId }).onConflictDoNothing();
    return reply.status(204).send();
  });

  app.delete("/favorites/:unitId", { preHandler: app.requireBuyer }, async (request, reply) => {
    const { unitId } = UnitParams.parse(request.params);
    await app.db.delete(buyerFavorites).where(and(eq(buyerFavorites.buyerId, currentBuyer(request).id), eq(buyerFavorites.unitId, unitId)));
    return reply.status(204).send();
  });
}
