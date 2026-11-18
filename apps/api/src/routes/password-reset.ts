import { and, eq, gt, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { PasswordResetConfirm, PasswordResetRequest } from "@synapse/contracts";
import { auditEvents, organizationMemberships, passwordResets, users } from "@synapse/db";
import { passwordResetEmail, tokenLink } from "../lib/emails";
import { badRequest, serviceUnavailable } from "../lib/errors";
import { hashPassword } from "../lib/passwords";
import { expiresIn, hashToken, newToken } from "../lib/tokens";
import type { TokenRouteOptions } from "./invitations";

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export default async function passwordResetRoutes(app: FastifyInstance, opts: TokenRouteOptions) {
  const config = { rateLimit: { max: opts.credentialRateLimit, timeWindow: "1 minute" } };

  /** Always 202, so the answer does not reveal whether the email has an account. */
  app.post("/password-reset/request", { config }, async (request, reply) => {
    const { email } = PasswordResetRequest.parse(request.body);
    const mailer = app.mailer;
    if (!mailer) throw serviceUnavailable("Email is not configured");
    const [user] = await app.db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, email.toLowerCase()));
    if (user) {
      const { token, tokenHash } = newToken();
      await app.db.insert(passwordResets).values({ userId: user.id, tokenHash, expiresAt: expiresIn(PASSWORD_RESET_TTL_MS) });
      const message = passwordResetEmail(user.email, tokenLink(app.config.adminPublicUrl, "reset-password", token));
      // Not awaited: an SMTP round trip would make known emails measurably slower.
      mailer.send(message).catch((error: unknown) => request.log.error({ err: error }, "password reset email failed"));
    }
    return reply.status(202).send({ ok: true });
  });

  /** Sets the new password, burns every open reset link of the user and signs out all sessions. */
  app.post("/password-reset/confirm", { config }, async (request, reply) => {
    const input = PasswordResetConfirm.parse(request.body);
    const passwordHash = await hashPassword(input.password);
    const now = new Date();
    await app.db.transaction(async (tx) => {
      const [reset] = await tx
        .update(passwordResets)
        .set({ usedAt: now })
        .where(and(eq(passwordResets.tokenHash, hashToken(input.token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, now)))
        .returning({ userId: passwordResets.userId });
      if (!reset) throw badRequest("The reset link is invalid or has expired");
      await tx.update(passwordResets).set({ usedAt: now }).where(and(eq(passwordResets.userId, reset.userId), isNull(passwordResets.usedAt)));
      await tx.update(users).set({ passwordHash, sessionsValidAfter: now }).where(eq(users.id, reset.userId));
      const memberships = await tx
        .select({ organizationId: organizationMemberships.organizationId })
        .from(organizationMemberships)
        .where(eq(organizationMemberships.userId, reset.userId));
      if (memberships.length) {
        await tx.insert(auditEvents).values(
          memberships.map(({ organizationId }) => ({
            organizationId,
            actorId: reset.userId,
            action: "user.password_reset",
            entity: "user",
            entityId: reset.userId,
          })),
        );
      }
    });
    reply.header("Cache-Control", "no-store");
    return reply.status(204).send();
  });
}
