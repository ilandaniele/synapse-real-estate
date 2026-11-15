import { auditEvents, type Db } from "@synapse/db";

/** Anything that can insert: the db itself or a transaction handle. */
export type Executor = Pick<Db, "insert" | "select" | "update" | "delete">;

export async function audit(
  executor: Executor,
  actor: { userId: string | null; organizationId: string },
  action: string,
  entity: string,
  entityId: string | null,
  summary: Record<string, unknown> = {},
): Promise<void> {
  await executor.insert(auditEvents).values({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    action,
    entity,
    entityId,
    summary,
  });
}

/** Keeps audit diffs small: only the keys that were actually sent, never secrets. */
export function changedKeys(input: Record<string, unknown>): string[] {
  return Object.keys(input).filter((k) => input[k] !== undefined);
}
