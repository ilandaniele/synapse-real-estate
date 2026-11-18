import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WebhookDelivery, WebhookEndpoint, WebhookEndpointCreated } from "@synapse/contracts";
import { auditEvents, webhookDeliveries, webhookEndpoints } from "@synapse/db";
import { assertDeliverableUrl, deliverNextWebhook, isPrivateAddress, MAX_DELIVERY_ATTEMPTS, signWebhook } from "../src/lib/webhooks";
import { ADMIN, createTestContext, EMAILS, type TestContext } from "./helpers";

interface Received {
  headers: IncomingHttpHeaders;
  body: string;
}

let ctx: TestContext;
let owner: string;
let receiver: Server;
let receiverUrl: string;
let received: Received[] = [];
let replyStatus = 200;

beforeAll(async () => {
  ctx = await createTestContext();
  owner = await ctx.login(EMAILS.owner);
  receiver = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({ headers: req.headers, body });
      res.writeHead(replyStatus).end();
    });
  });
  await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve));
  receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hook`;
});
afterAll(async () => {
  await new Promise((resolve) => receiver.close(resolve));
  await ctx.close();
});
beforeEach(async () => {
  received = [];
  replyStatus = 200;
  await ctx.db.delete(webhookEndpoints);
});

const send = (method: "POST" | "DELETE" | "GET", url: string, cookie: string | undefined, payload?: object) =>
  ctx.app.inject({ method, url, headers: cookie ? { cookie } : {}, ...(payload ? { payload } : {}) });

async function createEndpoint(cookie = owner, url = receiverUrl) {
  const res = await send("POST", `${ADMIN}/webhooks`, cookie, { url, description: "CRM" });
  expect(res.statusCode, res.body).toBe(201);
  return WebhookEndpointCreated.parse(res.json());
}

const submitLead = (unitId?: string) =>
  ctx.app.inject({
    method: "POST",
    url: "/api/v1/public/leads",
    payload: { developmentSlug: "dev-a", unitId, name: "Lucia", email: "Lucia@Example.com", phone: "600000000", message: "Hola", consent: true },
  });

const deliver = () => deliverNextWebhook(ctx.db, { isProd: false });
const makeDue = () => ctx.db.update(webhookDeliveries).set({ nextAttemptAt: new Date(0) });
const deliveries = async (endpointId: string) => (await send("GET", `${ADMIN}/webhooks/${endpointId}/deliveries`, owner)).json() as WebhookDelivery[];

describe("webhook endpoints", () => {
  it("returns the secret only on creation and audits it", async () => {
    const created = await createEndpoint();
    expect(created.secret).toMatch(/^whsec_[0-9a-f]{48}$/);

    const list = await send("GET", `${ADMIN}/webhooks`, owner);
    expect(list.statusCode).toBe(200);
    expect(list.json<WebhookEndpoint[]>().map((endpoint) => endpoint.id)).toEqual([created.id]);
    expect(list.body).not.toContain(created.secret);

    const audits = await ctx.db.select({ action: auditEvents.action }).from(auditEvents).where(eq(auditEvents.entityId, created.id));
    expect(audits.map((a) => a.action)).toEqual(["webhook.create"]);
  });

  it("is restricted to owners and scoped to the organization", async () => {
    const created = await createEndpoint();
    expect((await send("GET", `${ADMIN}/webhooks`, undefined)).statusCode).toBe(401);
    const editor = await ctx.login(EMAILS.editor);
    expect((await send("GET", `${ADMIN}/webhooks`, editor)).statusCode).toBe(403);
    expect((await send("POST", `${ADMIN}/webhooks`, editor, { url: receiverUrl })).statusCode).toBe(403);

    const ownerB = await ctx.login(EMAILS.ownerB);
    expect((await send("GET", `${ADMIN}/webhooks`, ownerB)).json()).toEqual([]);
    expect((await send("GET", `${ADMIN}/webhooks/${created.id}/deliveries`, ownerB)).statusCode).toBe(404);
    expect((await send("DELETE", `${ADMIN}/webhooks/${created.id}`, ownerB)).statusCode).toBe(404);

    expect((await send("DELETE", `${ADMIN}/webhooks/${created.id}`, owner)).statusCode).toBe(204);
    expect((await send("GET", `${ADMIN}/webhooks`, owner)).json()).toEqual([]);
  });

  it("rejects URLs that are not http(s)", async () => {
    const res = await send("POST", `${ADMIN}/webhooks`, owner, { url: "ftp://crm.example.com/hook" });
    expect(res.statusCode).toBe(400);
  });
});

describe("lead.created delivery", () => {
  it("posts a signed lead payload to every endpoint of the organization", async () => {
    const endpoint = await createEndpoint();
    const res = await submitLead(ctx.fx.unitA1);
    expect(res.statusCode).toBe(201);

    expect(await deliver()).toBe(true);
    expect(await deliver()).toBe(false);
    expect(received).toHaveLength(1);
    const [{ headers, body }] = received as [Received];
    expect(headers["x-synapse-event"]).toBe("lead.created");
    const timestamp = Number(/t=(\d+)/.exec(String(headers["x-synapse-signature"]))![1]);
    expect(headers["x-synapse-signature"]).toBe(signWebhook(endpoint.secret, timestamp, body));

    const payload = JSON.parse(body);
    expect(payload).toMatchObject({
      type: "lead.created",
      data: { leadId: res.json().id, unit: { id: ctx.fx.unitA1, code: "V1" }, email: "lucia@example.com", development: { slug: "dev-a" } },
    });
    const [delivery] = await deliveries(endpoint.id);
    expect(delivery).toMatchObject({ id: headers["x-synapse-delivery"], status: "DELIVERED", attempts: 1, responseStatus: 200 });
  });

  it("does not deliver another organization's leads", async () => {
    const ownerB = await ctx.login(EMAILS.ownerB);
    await createEndpoint(ownerB);
    expect((await submitLead()).statusCode).toBe(201);
    expect(await deliver()).toBe(false);
  });

  it("retries after an error and marks the delivery FAILED after the last attempt", async () => {
    const endpoint = await createEndpoint();
    replyStatus = 500;
    await submitLead();

    await deliver();
    let [delivery] = await deliveries(endpoint.id);
    expect(delivery).toMatchObject({ status: "PENDING", attempts: 1, responseStatus: 500, lastError: "HTTP 500" });
    expect(new Date(delivery!.nextAttemptAt).getTime()).toBeGreaterThan(Date.now());
    expect(await deliver()).toBe(false);

    for (let attempt = 2; attempt <= MAX_DELIVERY_ATTEMPTS; attempt++) {
      await makeDue();
      expect(await deliver()).toBe(true);
    }
    [delivery] = await deliveries(endpoint.id);
    expect(delivery).toMatchObject({ status: "FAILED", attempts: MAX_DELIVERY_ATTEMPTS });
    await makeDue();
    expect(await deliver()).toBe(false);
    expect(received).toHaveLength(MAX_DELIVERY_ATTEMPTS);
    expect(new Set(received.map((r) => JSON.parse(r.body).id)).size).toBe(1);
  });

  it("recovers on a later attempt", async () => {
    const endpoint = await createEndpoint();
    replyStatus = 503;
    await submitLead();
    await deliver();
    replyStatus = 204;
    await makeDue();
    await deliver();
    const [delivery] = await deliveries(endpoint.id);
    expect(delivery).toMatchObject({ status: "DELIVERED", attempts: 2, responseStatus: 204, lastError: null });
  });
});

describe("webhook URL guard in production", () => {
  it("requires https and a public address", async () => {
    await expect(assertDeliverableUrl("http://crm.example.com/hook", true)).rejects.toThrow("https");
    await expect(assertDeliverableUrl("https://127.0.0.1/hook", true)).rejects.toThrow("public address");
    await expect(assertDeliverableUrl("https://[::1]/hook", true)).rejects.toThrow("public address");
    await expect(assertDeliverableUrl("https://localhost/hook", true)).rejects.toThrow("public address");
    await expect(assertDeliverableUrl("https://93.184.215.14/hook", true)).resolves.toBeUndefined();
    await expect(assertDeliverableUrl("http://127.0.0.1/hook", false)).resolves.toBeUndefined();
  });

  it("classifies private, link-local and mapped addresses", () => {
    for (const address of ["10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::ffff:127.0.0.1", "fd00::1", "fe80::1"]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    for (const address of ["8.8.8.8", "93.184.215.14", "2606:4700::1111"]) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });
});
