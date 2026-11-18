import { createHmac } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import { ADMIN, adminLogin, API } from "./helpers";

interface Received {
  headers: IncomingHttpHeaders;
  body: string;
}

let receiver: Server;
let receiverUrl: string;
const received: Received[] = [];

test.beforeAll(async () => {
  receiver = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({ headers: req.headers, body });
      res.writeHead(200).end();
    });
  });
  await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve));
  receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/crm`;
});
test.afterAll(() => new Promise<void>((resolve) => receiver.close(() => resolve())));

test.describe("Flujo G — webhook de leads hacia un CRM", () => {
  test("el propietario crea un webhook, un lead llega firmado y la entrega aparece como entregada", async ({ page, request }) => {
    await adminLogin(page);
    await page.getByTestId("nav-integrations").click();
    await page.getByTestId("webhook-create-open").click();
    await page.getByTestId("webhook-field-url").fill(receiverUrl);
    await page.getByTestId("webhook-field-description").fill("CRM de prueba");
    await page.getByTestId("webhook-save").click();
    const secret = (await page.getByTestId("webhook-secret").textContent())!.trim();
    expect(secret).toMatch(/^whsec_/);
    await page.getByTestId("webhook-secret-done").click();
    await expect(page.getByTestId("webhook-row")).toContainText(receiverUrl);
    await expect(page.getByTestId("webhook-table")).not.toContainText(secret);

    const lead = await request.post(`${API}/api/v1/public/leads`, {
      data: { developmentSlug: "lomas-del-faro", name: "Cliente Webhook", email: "webhook@example.com", consent: true },
    });
    expect(lead.status()).toBe(201);
    await expect.poll(() => received.length, { timeout: 15_000 }).toBe(1);
    const [{ headers, body }] = received as [Received];
    const [, timestamp, signature] = /^t=(\d+),v1=([0-9a-f]+)$/.exec(String(headers["x-synapse-signature"]))!;
    expect(signature).toBe(createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex"));
    expect(JSON.parse(body)).toMatchObject({ type: "lead.created", data: { email: "webhook@example.com" } });

    await page.getByTestId("webhook-manage").click();
    await expect(page.getByTestId("webhook-delivery-row")).toContainText("Entregado");
    await page.getByTestId("webhook-delete").click();
    await page.getByTestId("webhook-delete-confirm").click();
    await expect(page.getByTestId("webhook-row")).toHaveCount(0);
    await expect(page).toHaveURL(`${ADMIN}/integrations`);
  });
});
