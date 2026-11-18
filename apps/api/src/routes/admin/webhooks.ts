import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { WebhookEndpointInput, type WebhookDelivery, type WebhookEndpoint, type WebhookEndpointCreated } from "@synapse/contracts";
import { webhookDeliveries, webhookEndpoints } from "@synapse/db";
import { audit } from "../../lib/audit";
import { session } from "../../lib/auth";
import { badRequest, notFound } from "../../lib/errors";
import { IdParams } from "../../lib/params";
import { assertDeliverableUrl, newWebhookSecret } from "../../lib/webhooks";

const ENDPOINT_LIST_LIMIT = 50;
const DELIVERY_LIST_LIMIT = 50;

const endpointColumns = {
  id: webhookEndpoints.id,
  url: webhookEndpoints.url,
  description: webhookEndpoints.description,
  createdAt: webhookEndpoints.createdAt,
};

const toEndpoint = (row: { id: string; url: string; description: string | null; createdAt: Date }): WebhookEndpoint => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});

const iso = (date: Date | null) => date?.toISOString() ?? null;

export default async function webhookRoutes(app: FastifyInstance) {
  const manage = { preHandler: app.requireAuth("integration:manage") };

  app.get("/webhooks", manage, async (request) => {
    const { organizationId } = session(request);
    const rows = await app.db
      .select(endpointColumns)
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.organizationId, organizationId))
      .orderBy(desc(webhookEndpoints.createdAt))
      .limit(ENDPOINT_LIST_LIMIT);
    return rows.map(toEndpoint);
  });

  app.post("/webhooks", manage, async (request, reply) => {
    const actor = session(request);
    const input = WebhookEndpointInput.parse(request.body);
    try {
      await assertDeliverableUrl(input.url, app.config.isProd);
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : "Webhook URL is not allowed");
    }
    const created = await app.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(webhookEndpoints)
        .values({ organizationId: actor.organizationId, url: input.url, description: input.description || null, secret: newWebhookSecret() })
        .returning({ ...endpointColumns, secret: webhookEndpoints.secret });
      await audit(tx, actor, "webhook.create", "webhook_endpoint", row!.id, { url: input.url });
      return row!;
    });
    const body: WebhookEndpointCreated = { ...toEndpoint(created), secret: created.secret };
    return reply.status(201).send(body);
  });

  app.delete("/webhooks/:id", manage, async (request, reply) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    await app.db.transaction(async (tx) => {
      const [row] = await tx
        .delete(webhookEndpoints)
        .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.organizationId, actor.organizationId)))
        .returning({ url: webhookEndpoints.url });
      if (!row) throw notFound("Webhook");
      await audit(tx, actor, "webhook.delete", "webhook_endpoint", id, { url: row.url });
    });
    return reply.status(204).send();
  });

  app.get("/webhooks/:id/deliveries", manage, async (request) => {
    const { organizationId } = session(request);
    const { id } = IdParams.parse(request.params);
    const rows = await app.db
      .select({
        id: webhookDeliveries.id,
        event: webhookDeliveries.event,
        status: webhookDeliveries.status,
        attempts: webhookDeliveries.attempts,
        responseStatus: webhookDeliveries.responseStatus,
        lastError: webhookDeliveries.lastError,
        nextAttemptAt: webhookDeliveries.nextAttemptAt,
        deliveredAt: webhookDeliveries.deliveredAt,
        createdAt: webhookDeliveries.createdAt,
        endpointId: webhookEndpoints.id,
      })
      .from(webhookEndpoints)
      .leftJoin(webhookDeliveries, eq(webhookDeliveries.endpointId, webhookEndpoints.id))
      .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.organizationId, organizationId)))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(DELIVERY_LIST_LIMIT);
    if (rows.length === 0) throw notFound("Webhook");
    return rows.flatMap(({ endpointId: _endpoint, ...row }): WebhookDelivery[] =>
      row.id
        ? [
            {
              ...row,
              id: row.id,
              event: row.event as WebhookDelivery["event"],
              status: row.status!,
              attempts: row.attempts!,
              nextAttemptAt: row.nextAttemptAt!.toISOString(),
              deliveredAt: iso(row.deliveredAt),
              createdAt: row.createdAt!.toISOString(),
            },
          ]
        : [],
    );
  });
}
