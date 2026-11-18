import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Reservation, ReservationCreated, ReservationSettings } from "@synapse/contracts";
import { reservations, unitAvailabilityHistory, units } from "@synapse/db";
import { loadConfig } from "../src/config";
import { hashToken } from "../src/lib/tokens";
import { ADMIN, createTestContext, EMAILS, type TestContext } from "./helpers";

const BASE = "/api/v1/public/reservations";
let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await ctx.db.delete(reservations);
  await ctx.db.delete(unitAvailabilityHistory);
  await ctx.db.update(units).set({ status: "AVAILABLE" }).where(eq(units.id, ctx.fx.unitA1));
});

const body = (overrides: Record<string, unknown> = {}) => ({
  developmentSlug: "dev-a",
  unitId: ctx.fx.unitA1,
  name: "Carla Compradora",
  email: "Carla@Example.com",
  phone: "+34 600 000 000",
  consent: true,
  ...overrides,
});

const reserve = (overrides: Record<string, unknown> = {}, app = ctx.app) =>
  app.inject({ method: "POST", url: BASE, payload: body(overrides) });

async function startReservation() {
  const res = await reserve();
  expect(res.statusCode).toBe(201);
  return ReservationCreated.parse(res.json());
}

const pay = (id: string, checkoutToken: string, outcome: "approve" | "decline" = "approve", app = ctx.app) =>
  app.inject({ method: "POST", url: `${BASE}/${id}/mock-payment`, payload: { checkoutToken, outcome } });

const unitStatus = async (id = ctx.fx.unitA1) =>
  (await ctx.db.select({ status: units.status }).from(units).where(eq(units.id, id)))[0]!.status;

describe("GET /public/reservations/settings", () => {
  it("reports the mock provider and the deposit", async () => {
    const res = await ctx.app.inject({ method: "GET", url: `${BASE}/settings` });
    expect(res.statusCode).toBe(200);
    expect(ReservationSettings.parse(res.json())).toEqual({ enabled: true, depositAmount: "3000.00" });
  });
});

describe("POST /public/reservations", () => {
  it("creates a pending reservation and stores only the token hash", async () => {
    const created = await startReservation();
    expect(created).toMatchObject({ unitCode: "V1", depositAmount: "3000.00", currency: "EUR" });
    const [row] = await ctx.db.select().from(reservations).where(eq(reservations.id, created.id));
    expect(row).toMatchObject({ status: "PENDING", email: "carla@example.com", paymentProvider: "mock", organizationId: ctx.fx.orgA });
    expect(row!.checkoutTokenHash).toBe(hashToken(created.checkoutToken));
    expect(JSON.stringify(row)).not.toContain(created.checkoutToken);
    expect(await unitStatus()).toBe("AVAILABLE");
  });

  it("rejects units that are reserved, unlisted or from another development", async () => {
    for (const unitId of [ctx.fx.unitA3, ctx.fx.unitA2, ctx.fx.unitB1]) {
      const res = await reserve({ unitId });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("UNIT_NOT_AVAILABLE");
    }
    expect(await ctx.db.select().from(reservations)).toHaveLength(0);
  });

  it("requires consent and a valid email", async () => {
    expect((await reserve({ consent: false })).statusCode).toBe(400);
    expect((await reserve({ email: "not-an-email" })).statusCode).toBe(400);
  });
});

describe("POST /public/reservations/:id/mock-payment", () => {
  it("approve marks it paid, reserves the unit and records the change", async () => {
    const { id, checkoutToken } = await startReservation();
    const res = await pay(id, checkoutToken);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "PAID", paymentRef: expect.stringMatching(/^mock_/) });

    expect(await unitStatus()).toBe("RESERVED");
    const [row] = await ctx.db.select().from(reservations).where(eq(reservations.id, id));
    expect(row).toMatchObject({ status: "PAID", paymentRef: res.json().paymentRef });
    expect(row!.paidAt).toBeInstanceOf(Date);
    const history = await ctx.db.select().from(unitAvailabilityHistory).where(eq(unitAvailabilityHistory.unitId, ctx.fx.unitA1));
    expect(history).toEqual([
      expect.objectContaining({ fromStatus: "AVAILABLE", toStatus: "RESERVED", changedBy: null, reason: `Reserva online ${res.json().paymentRef}` }),
    ]);
  });

  it("decline returns 402 and leaves the reservation pending for a retry", async () => {
    const { id, checkoutToken } = await startReservation();
    const declined = await pay(id, checkoutToken, "decline");
    expect(declined.statusCode).toBe(402);
    expect(declined.json().error.code).toBe("PAYMENT_DECLINED");
    expect(await unitStatus()).toBe("AVAILABLE");
    expect((await pay(id, checkoutToken)).statusCode).toBe(200);
  });

  it("a wrong token, unknown id or second payment gives 404", async () => {
    const { id, checkoutToken } = await startReservation();
    const wrongToken = "x".repeat(43);
    expect((await pay(id, wrongToken)).statusCode).toBe(404);
    expect((await pay(id, wrongToken, "decline")).statusCode).toBe(404);
    expect((await pay(ctx.fx.unitA1, checkoutToken)).statusCode).toBe(404);
    expect((await pay(id, checkoutToken)).statusCode).toBe(200);
    expect((await pay(id, checkoutToken)).statusCode).toBe(404);
  });

  it("only the first of two paid reservations gets the unit; the second fails with 409", async () => {
    const first = await startReservation();
    const second = await startReservation();
    expect((await pay(first.id, first.checkoutToken)).statusCode).toBe(200);
    const late = await pay(second.id, second.checkoutToken);
    expect(late.statusCode).toBe(409);
    expect(late.json().error.code).toBe("UNIT_NOT_AVAILABLE");
    const rows = await ctx.db.select({ id: reservations.id, status: reservations.status, paidAt: reservations.paidAt }).from(reservations);
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: first.id, status: "PAID", paidAt: expect.any(Date) },
        { id: second.id, status: "FAILED", paidAt: null },
      ]),
    );
    expect(await ctx.db.select().from(unitAvailabilityHistory)).toHaveLength(1);
  });
});

describe("GET /admin/reservations", () => {
  const list = (cookie: string | undefined, query = "") =>
    ctx.app.inject({ method: "GET", url: `${ADMIN}/reservations${query}`, headers: cookie ? { cookie } : {} });

  it("lists the organization's reservations for sales, newest first, filtered by status", async () => {
    const { id, checkoutToken } = await startReservation();
    await startReservation();
    await pay(id, checkoutToken);

    const res = await list(await ctx.login(EMAILS.sales));
    expect(res.statusCode).toBe(200);
    const page = res.json();
    expect(page).toMatchObject({ total: 2, page: 1, pageSize: 25 });
    const items = page.items.map((item: unknown) => Reservation.parse(item));
    expect(items.every((item: Reservation) => item.unitCode === "V1")).toBe(true);
    expect(JSON.stringify(page)).not.toMatch(/checkoutToken|tokenHash/);

    const paid = (await list(await ctx.login(EMAILS.sales), "?status=PAID")).json();
    expect(paid.items).toEqual([expect.objectContaining({ id, status: "PAID", paymentRef: expect.stringMatching(/^mock_/) })]);
  });

  it("hides other organizations' reservations and enforces auth and role", async () => {
    await startReservation();
    expect((await list(await ctx.login(EMAILS.ownerB))).json()).toMatchObject({ items: [], total: 0 });
    expect((await list(await ctx.login(EMAILS.viewer))).statusCode).toBe(403);
    expect((await list(undefined)).statusCode).toBe(401);
  });
});

describe("payment provider off", () => {
  it("is off by default in production and on by default elsewhere", () => {
    const quiet = () => {};
    const prod = { NODE_ENV: "production", SESSION_SECRET: "s".repeat(40), PUBLIC_API_URL: "https://api.example.test" };
    expect(loadConfig(prod, quiet).paymentProvider).toBe("none");
    expect(loadConfig({ ...prod, PAYMENT_PROVIDER: "mock" }, quiet).paymentProvider).toBe("mock");
    expect(loadConfig({ PUBLIC_API_URL: "" }, quiet).paymentProvider).toBe("mock");
  });

  it("reports reservations disabled and answers 503", async () => {
    const off = await createTestContext({ config: { paymentProvider: "none" } });
    try {
      expect((await off.app.inject({ method: "GET", url: `${BASE}/settings` })).json()).toEqual({ enabled: false, depositAmount: null });
      expect((await reserve({ unitId: off.fx.unitA1 }, off.app)).statusCode).toBe(503);
      expect((await pay(off.fx.unitA1, "x".repeat(43), "approve", off.app)).statusCode).toBe(503);
    } finally {
      await off.close();
    }
  });
});
