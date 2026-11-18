import { expect, test, type Page } from "@playwright/test";
import { ADMIN, adminLogin } from "./helpers";

/** Needs Mailpit (`docker compose up -d mailpit`) and E2E_SMTP_URL=smtp://localhost:1025 so the API really sends. */
const MAILPIT_API = process.env.E2E_MAILPIT_API_URL ?? "http://localhost:8025";
const NEW_PASSWORD = "invited-e2e-password-1";

async function linkFromMailpit(to: string, page: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await fetch(`${MAILPIT_API}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
        const { messages } = (await search.json()) as { messages: { ID: string }[] };
        if (!messages[0]) return undefined;
        const message = (await (await fetch(`${MAILPIT_API}/api/v1/message/${messages[0].ID}`)).json()) as { Text: string };
        link = message.Text.match(new RegExp(`${ADMIN}/${page}#token=[\\w-]+`))?.[0];
        return link;
      },
      { timeout: 15_000 },
    )
    .toBeTruthy();
  return link!;
}

async function login(page: Page, email: string, password: string) {
  await page.goto(`${ADMIN}/login`);
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
}

test.describe("Flujo F — invitación y recuperación de contraseña por email", () => {
  test.skip(!process.env.E2E_SMTP_URL, "E2E_SMTP_URL not set: Mailpit flow skipped");

  test("invitar, aceptar, cerrar sesión y restablecer la contraseña", async ({ page, browser }) => {
    const email = `invitada-${Date.now()}@example.test`;
    await adminLogin(page);
    await page.goto(`${ADMIN}/members`);
    await page.getByTestId("member-invite-open").click();
    await page.getByTestId("invite-field-email").fill(email);
    await page.getByTestId("invite-field-role").selectOption("SALES");
    await page.getByTestId("invite-send").click();
    await expect(page.getByTestId("invitation-row").filter({ hasText: email })).toBeVisible();

    const invitee = await browser.newPage();
    await invitee.goto(await linkFromMailpit(email, "accept-invite"));
    await expect(invitee).toHaveURL(`${ADMIN}/accept-invite`);
    await invitee.getByTestId("invite-name").fill("Invitada E2E");
    await invitee.getByTestId("invite-password").fill(NEW_PASSWORD);
    await invitee.getByTestId("invite-submit").click();
    await expect(invitee).not.toHaveURL(/accept-invite/);
    await page.reload();
    await expect(page.getByTestId("member-row").filter({ hasText: email })).toBeVisible();
    await expect(page.getByTestId("invitation-row").filter({ hasText: email })).toHaveCount(0);

    await invitee.context().clearCookies();
    await invitee.goto(`${ADMIN}/login`);
    await invitee.getByTestId("login-forgot").click();
    await invitee.getByTestId("forgot-email").fill(email);
    await invitee.getByTestId("forgot-submit").click();
    await expect(invitee.getByTestId("forgot-sent")).toBeVisible();

    await invitee.goto(await linkFromMailpit(email, "reset-password"));
    await invitee.getByTestId("reset-password").fill(`${NEW_PASSWORD}-2`);
    await invitee.getByTestId("reset-submit").click();
    await expect(invitee.getByTestId("reset-done")).toBeVisible();

    await login(invitee, email, NEW_PASSWORD);
    await expect(invitee.getByTestId("login-error")).toBeVisible();
    await login(invitee, email, `${NEW_PASSWORD}-2`);
    await expect(invitee).not.toHaveURL(/\/login/);
  });

  test("un propietario genera un enlace de restablecimiento desde «Miembros»", async ({ page, browser }) => {
    const email = `enlace-${Date.now()}@example.test`;
    const password = "handed-over-e2e-password-1";
    await adminLogin(page);
    await page.goto(`${ADMIN}/members`);
    await page.getByTestId("member-create-open").click();
    await page.getByTestId("member-field-email").fill(email);
    await page.getByTestId("member-field-name").fill("Enlace E2E");
    await page.getByTestId("member-field-role").selectOption("SALES");
    await page.getByTestId("member-field-password").fill(NEW_PASSWORD);
    await page.getByTestId("member-save").click();
    const row = page.getByTestId("member-row").filter({ hasText: email });
    await row.getByTestId("member-manage").click();
    await page.getByTestId("member-reset-link-create").click();
    const link = await page.getByTestId("member-reset-link-value").inputValue();
    expect(link).toMatch(new RegExp(`^${ADMIN}/reset-password#token=[\\w-]+$`));

    const member = await browser.newPage();
    await member.goto(link);
    await member.getByTestId("reset-password").fill(password);
    await member.getByTestId("reset-submit").click();
    await expect(member.getByTestId("reset-done")).toBeVisible();
    await login(member, email, password);
    await expect(member).not.toHaveURL(/\/login/);
  });
});
