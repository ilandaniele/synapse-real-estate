import type { FastifyBaseLogger } from "fastify";
import nodemailer from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

const SMTP_TIMEOUT_MS = 10_000;

export function smtpMailer(url: string, from: string): Mailer {
  const transport = nodemailer.createTransport({
    url,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });
  return {
    async send(message) {
      await transport.sendMail({ from, ...message });
    },
  };
}

/** Development without SMTP: the message, links included, goes to the log. */
export function logMailer(log: FastifyBaseLogger): Mailer {
  return {
    async send(message) {
      log.warn({ mail: message }, "SMTP_URL not set: email written to the log instead of sent");
    },
  };
}
