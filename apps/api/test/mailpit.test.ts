import { describe, expect, it } from "vitest";
import { smtpMailer } from "../src/lib/mailer";

const SMTP_URL = process.env.MAILPIT_SMTP_URL?.trim();
const API_URL = process.env.MAILPIT_API_URL?.trim() ?? "http://localhost:8025";

interface MailpitList {
  messages: { ID: string; Subject: string; To: { Address: string }[] }[];
}

describe.skipIf(!SMTP_URL)("SMTP delivery through Mailpit", () => {
  it("delivers a message with its link intact", async () => {
    const to = `smtp-${Date.now()}@example.test`;
    await smtpMailer(SMTP_URL!, "Synapse <no-reply@synapse.local>").send({
      to,
      subject: "Prueba SMTP",
      text: "Enlace: https://admin.example.test/accept-invite#token=abc_DEF-123",
    });

    const list = (await (await fetch(`${API_URL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json()) as MailpitList;
    expect(list.messages).toHaveLength(1);
    expect(list.messages[0]!.Subject).toBe("Prueba SMTP");
    const message = (await (await fetch(`${API_URL}/api/v1/message/${list.messages[0]!.ID}`)).json()) as { Text: string };
    expect(message.Text).toContain("#token=abc_DEF-123");
  });
});
