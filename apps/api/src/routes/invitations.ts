import { and, eq, gt, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { InvitationAccept, TokenBody, type InvitationPreview, type SessionUser } from "@synapse/contracts";
import { invitations, organizationMemberships, organizations, users } from "@synapse/db";
import { audit } from "../lib/audit";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "../lib/auth";
import { conflict, isUniqueViolation, notFound } from "../lib/errors";
import { hashPassword } from "../lib/passwords";
import { hashToken } from "../lib/tokens";

export interface TokenRouteOptions {
  credentialRateLimit: number;
}

const usable = (token: string) =>
  and(eq(invitations.tokenHash, hashToken(token)), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date()));

/** Public side of invitations. Tokens travel in the body, never in the URL, to keep them out of logs. */
export default async function invitationAcceptRoutes(app: FastifyInstance, opts: TokenRouteOptions) {
  const config = { rateLimit: { max: opts.credentialRateLimit, timeWindow: "1 minute" } };

  app.post("/invitations/preview", { config }, async (request, reply) => {
    const { token } = TokenBody.parse(request.body);
    const [row] = await app.db
      .select({ email: invitations.email, role: invitations.role, organizationName: organizations.name, expiresAt: invitations.expiresAt })
      .from(invitations)
      .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
      .where(usable(token));
    if (!row) throw notFound("Invitation");
    reply.header("Cache-Control", "no-store");
    const preview: InvitationPreview = { ...row, expiresAt: row.expiresAt.toISOString() };
    return preview;
  });

  /** Creates the account and membership, consumes the invitation and signs the user in. */
  app.post("/invitations/accept", { config }, async (request, reply) => {
    const input = InvitationAccept.parse(request.body);
    const passwordHash = await hashPassword(input.password);
    let user: SessionUser;
    try {
      user = await app.db.transaction(async (tx) => {
        const [invitation] = await tx
          .update(invitations)
          .set({ acceptedAt: new Date() })
          .where(usable(input.token))
          .returning({ id: invitations.id, organizationId: invitations.organizationId, email: invitations.email, role: invitations.role });
        if (!invitation) throw notFound("Invitation");
        const [created] = await tx.insert(users).values({ email: invitation.email, name: input.name, passwordHash }).returning({ id: users.id });
        const [membership] = await tx
          .insert(organizationMemberships)
          .values({ organizationId: invitation.organizationId, userId: created!.id, role: invitation.role })
          .returning({ id: organizationMemberships.id });
        const [organization] = await tx.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, invitation.organizationId));
        const actor = { userId: created!.id, organizationId: invitation.organizationId };
        await audit(tx, actor, "invitation.accept", "member", membership!.id, { invitationId: invitation.id, role: invitation.role });
        return {
          id: created!.id,
          email: invitation.email,
          name: input.name,
          organizationId: invitation.organizationId,
          organizationName: organization!.name,
          role: invitation.role,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("A user with this email already exists", "USER_EXISTS");
      throw error;
    }
    const token = await signSession(app.config.sessionSecret, { userId: user.id, organizationId: user.organizationId, role: user.role });
    reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(app.config));
    reply.header("Cache-Control", "no-store");
    return reply.status(201).send(user);
  });
}
