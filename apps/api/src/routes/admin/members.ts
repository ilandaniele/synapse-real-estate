import { and, asc, count, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { MemberInput, MemberPatch, type Member, type PasswordResetLink } from "@synapse/contracts";
import type { Role } from "@synapse/domain";
import { organizationMemberships, passwordResets, users, type Db } from "@synapse/db";
import { audit, type Executor } from "../../lib/audit";
import { session } from "../../lib/auth";
import { conflict, isUniqueViolation, notFound } from "../../lib/errors";
import { IdParams } from "../../lib/params";
import { hashPassword } from "../../lib/passwords";
import { tokenLink } from "../../lib/emails";
import { expiresIn, newToken } from "../../lib/tokens";
import { PASSWORD_RESET_TTL_MS } from "../password-reset";

const MEMBER_LIST_LIMIT = 200;

const memberColumns = {
  id: organizationMemberships.id,
  userId: users.id,
  email: users.email,
  name: users.name,
  role: organizationMemberships.role,
  createdAt: organizationMemberships.createdAt,
};

type MemberRow = { id: string; userId: string; email: string; name: string; role: Role; createdAt: Date };

const toMember = (row: MemberRow): Member => ({ ...row, createdAt: row.createdAt.toISOString() });

async function findMember(db: Db, organizationId: string, id: string): Promise<MemberRow> {
  const [row] = await db
    .select(memberColumns)
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(and(eq(organizationMemberships.id, id), eq(organizationMemberships.organizationId, organizationId)));
  if (!row) throw notFound("Member");
  return row;
}

/** An organization must always keep at least one OWNER. */
async function assertNotLastOwner(executor: Executor, organizationId: string, member: MemberRow) {
  if (member.role !== "OWNER") return;
  const [owners] = await executor
    .select({ total: count() })
    .from(organizationMemberships)
    .where(and(eq(organizationMemberships.organizationId, organizationId), eq(organizationMemberships.role, "OWNER")));
  if ((owners?.total ?? 0) <= 1) throw conflict("The organization must keep at least one owner", "LAST_OWNER");
}

export default async function memberRoutes(app: FastifyInstance) {
  app.get("/members", { preHandler: app.requireAuth("member:manage") }, async (request) => {
    const { organizationId } = session(request);
    const rows = await app.db
      .select(memberColumns)
      .from(organizationMemberships)
      .innerJoin(users, eq(users.id, organizationMemberships.userId))
      .where(eq(organizationMemberships.organizationId, organizationId))
      .orderBy(asc(organizationMemberships.createdAt))
      .limit(MEMBER_LIST_LIMIT);
    return rows.map(toMember);
  });

  app.post("/members", { preHandler: app.requireAuth("member:manage") }, async (request, reply) => {
    const actor = session(request);
    const input = MemberInput.parse(request.body);
    const email = input.email.toLowerCase();
    const passwordHash = await hashPassword(input.password);
    try {
      const membershipId = await app.db.transaction(async (tx) => {
        const [user] = await tx.insert(users).values({ email, name: input.name, passwordHash }).returning({ id: users.id });
        const [membership] = await tx
          .insert(organizationMemberships)
          .values({ organizationId: actor.organizationId, userId: user!.id, role: input.role })
          .returning({ id: organizationMemberships.id });
        await audit(tx, actor, "member.create", "member", membership!.id, { role: input.role });
        return membership!.id;
      });
      return reply.status(201).send(toMember(await findMember(app.db, actor.organizationId, membershipId)));
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("A user with this email already exists");
      throw error;
    }
  });

  app.patch("/members/:id", { preHandler: app.requireAuth("member:manage") }, async (request) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const { role } = MemberPatch.parse(request.body);
    const member = await findMember(app.db, actor.organizationId, id);
    await app.db.transaction(async (tx) => {
      if (role !== "OWNER") await assertNotLastOwner(tx, actor.organizationId, member);
      await tx.update(organizationMemberships).set({ role }).where(eq(organizationMemberships.id, id));
      await audit(tx, actor, "member.update", "member", id, { from: member.role, to: role });
    });
    return toMember({ ...member, role });
  });

  /**
   * Issues a one-time reset link for a member to share by hand when there is no SMTP server. Refused for users
   * who also belong to another organization, so an owner cannot take over an account outside their own.
   */
  app.post("/members/:id/password-reset-link", { preHandler: app.requireAuth("member:manage") }, async (request, reply) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const anyMembership = alias(organizationMemberships, "any_membership");
    const [target] = await app.db
      .select({ userId: organizationMemberships.userId, organizations: count(anyMembership.id) })
      .from(organizationMemberships)
      .innerJoin(anyMembership, eq(anyMembership.userId, organizationMemberships.userId))
      .where(and(eq(organizationMemberships.id, id), eq(organizationMemberships.organizationId, actor.organizationId)))
      .groupBy(organizationMemberships.userId);
    if (!target) throw notFound("Member");
    if (target.organizations > 1) {
      throw conflict("This user also belongs to another organization and must reset the password from the login page", "MEMBER_IN_OTHER_ORGANIZATIONS");
    }

    const { token, tokenHash } = newToken();
    const expiresAt = expiresIn(PASSWORD_RESET_TTL_MS);
    await app.db.transaction(async (tx) => {
      await tx.insert(passwordResets).values({ userId: target.userId, tokenHash, expiresAt });
      await audit(tx, actor, "member.password_reset_link", "member", id);
    });
    reply.header("Cache-Control", "no-store");
    const body: PasswordResetLink = { resetLink: tokenLink(app.config.adminPublicUrl, "reset-password", token), expiresAt: expiresAt.toISOString() };
    return reply.status(201).send(body);
  });

  /** Removes the membership; the user account goes too when it belongs to no other organization. */
  app.delete("/members/:id", { preHandler: app.requireAuth("member:manage") }, async (request, reply) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const member = await findMember(app.db, actor.organizationId, id);
    await app.db.transaction(async (tx) => {
      await assertNotLastOwner(tx, actor.organizationId, member);
      await audit(tx, actor, "member.delete", "member", id, { role: member.role });
      await tx.delete(organizationMemberships).where(eq(organizationMemberships.id, id));
      const [remaining] = await tx
        .select({ total: count() })
        .from(organizationMemberships)
        .where(eq(organizationMemberships.userId, member.userId));
      if ((remaining?.total ?? 0) === 0) await tx.delete(users).where(eq(users.id, member.userId));
    });
    return reply.status(204).send();
  });
}
