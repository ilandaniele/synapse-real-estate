import type { Role } from "@synapse/domain";
import type { MailMessage } from "./mailer";

/** The token goes in the fragment so it never reaches server logs or Referer headers. */
export const tokenLink = (adminUrl: string, page: string, token: string) => `${adminUrl}/${page}#token=${token}`;

export function invitationEmail(to: string, organizationName: string, role: Role, link: string): MailMessage {
  return {
    to,
    subject: `Invitación a ${organizationName}`,
    text: [
      `Te invitaron a unirte a ${organizationName} con el rol ${role}.`,
      "",
      `Creá tu cuenta en: ${link}`,
      "",
      "El enlace vence en 7 días. Si no esperabas esta invitación, ignorá este correo.",
    ].join("\n"),
  };
}

export function passwordResetEmail(to: string, link: string): MailMessage {
  return {
    to,
    subject: "Restablecer contraseña",
    text: [
      "Recibimos un pedido para restablecer tu contraseña.",
      "",
      `Elegí una nueva en: ${link}`,
      "",
      "El enlace vence en 1 hora y sirve una sola vez. Si no lo pediste, ignorá este correo.",
    ].join("\n"),
  };
}
