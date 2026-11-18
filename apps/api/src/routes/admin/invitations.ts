import { and, asc, eq, gt, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { InvitationInput, type Invitation } from "@synapse/contracts";
import { invitations, organizations, users } from "@synapse/db";
import { audit } from "../../lib/audit";
import { session } from "../../lib/auth";
import { invitationEmail, tokenLink } from "../../lib/emails";
import { conflict, HttpError, notFound, serviceUnavailable } from "../../lib/errors";
import { IdParams } from "../../lib/params";
import { expiresIn, newToken } from "../../lib/tokens";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INVITATION_LIST_LIMIT = 200;

const invitationColumns = {
  id: invitations.id,
  email: invitations.email,
  role: invitations.role,
  expiresAt: invitations.expiresAt,
  createdAt: invitations.createdAt,
};

type InvitationRow = { id: string; email: string; role: Invitation["role"]; expiresAt: Date; createdAt: Date };

const toInvitation = (row: InvitationRow): Invitation => ({
  ...row,
  expiresAt: row.expiresAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
});

const pendingIn = (organizationId: string) =>
  and(eq(invitations.organizationId, organizationId), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date()));

export default async function invitationRoutes(app: FastifyInstance) {
  app.get("/invitations", { preHandler: app.requireAuth("member:manage") }, async (request) => {
    const { organizationId } = session(request);
    const rows = await app.db
      .select(invitationColumns)
      .from(invitations)
      .where(pendingIn(organizationId))
      .orderBy(asc(invitations.createdAt))
      .limit(INVITATION_LIST_LIMIT);
    return rows.map(toInvitation);
  });

  /** Invites someone without an account; they choose name and password from the emailed link. */
  app.post("/invitations", { preHandler: app.requireAuth("member:manage") }, async (request, reply) => {
    const actor = session(request);
    const input = InvitationInput.parse(request.body);
    const mailer = app.mailer;
    if (!mailer) throw serviceUnavailable("Email is not configured");
    const email = input.email.toLowerCase();

    const [existing] = await app.db
      .select({ userId: users.id, invitationId: invitations.id, organizationName: organizations.name })
      .from(organizations)
      .leftJoin(users, eq(users.email, email))
      .leftJoin(invitations, and(pendingIn(actor.organizationId), eq(invitations.email, email)))
      .where(eq(organizations.id, actor.organizationId))
      .limit(1);
    if (!existing) throw notFound("Organization");
    if (existing.userId) throw conflict("A user with this email already exists", "USER_EXISTS");
    if (existing.invitationId) throw conflict("This email already has a pending invitation", "INVITATION_PENDING");

    const { token, tokenHash } = newToken();
    const row = await app.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(invitations)
        .values({
          organizationId: actor.organizationId,
          email,
          role: input.role,
          tokenHash,
          invitedBy: actor.userId,
          expiresAt: expiresIn(INVITATION_TTL_MS),
        })
        .returning(invitationColumns);
      await audit(tx, actor, "invitation.create", "invitation", created!.id, { role: input.role });
      return created!;
    });

    const link = tokenLink(app.config.adminPublicUrl, "accept-invite", token);
    try {
      await mailer.send(invitationEmail(email, existing.organizationName, input.role, link));
    } catch (error) {
      request.log.error({ err: error }, "invitation email failed");
      await app.db.delete(invitations).where(eq(invitations.id, row.id));
      throw new HttpError(502, "MAIL_FAILED", "The invitation email could not be sent");
    }
    return reply.status(201).send(toInvitation(row));
  });

  app.delete("/invitations/:id", { preHandler: app.requireAuth("member:manage") }, async (request, reply) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    await app.db.transaction(async (tx) => {
      const [deleted] = await tx
        .delete(invitations)
        .where(and(eq(invitations.id, id), eq(invitations.organizationId, actor.organizationId), isNull(invitations.acceptedAt)))
        .returning({ id: invitations.id });
      if (!deleted) throw notFound("Invitation");
      await audit(tx, actor, "invitation.revoke", "invitation", id);
    });
    return reply.status(204).send();
  });
}
