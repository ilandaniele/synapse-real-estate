"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { InvitationInput, type InvitationCreated } from "@synapse/contracts";
import type { Role } from "@synapse/domain";
import { api } from "@/lib/api";
import { keys, useInvitations } from "@/lib/queries";
import { formatDateTime, ROLE_LABELS } from "@/lib/format";
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from "@/lib/forms";
import { Button, Card, ErrorBanner, Modal, QueryBoundary, SelectField, TableShell, TD, TextField, TH } from "@/components/ui";
import { CopyableLink } from "@/components/CopyableLink";

export function PendingInvitations() {
  const invitations = useInvitations();
  const queryClient = useQueryClient();
  const revoke = useMutation({
    mutationFn: (id: string) => api<void>(`/admin/invitations/${id}`, { method: "DELETE" }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: keys.invitations }),
  });

  return (
    <Card title="Invitaciones pendientes">
      <ErrorBanner error={revoke.error} testId="invitation-revoke-error" />
      <QueryBoundary query={invitations} isEmpty={(items) => items.length === 0} emptyTitle="No hay invitaciones pendientes">
        {(items) => (
          <TableShell caption="Invitaciones pendientes" testId="invitation-table">
            <thead>
              <tr>
                <th className={TH}>Email</th>
                <th className={TH}>Rol</th>
                <th className={TH}>Vence</th>
                <th className={TH}>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((invitation) => (
                <tr key={invitation.id} data-testid="invitation-row">
                  <td className={TD}>{invitation.email}</td>
                  <td className={TD}>{ROLE_LABELS[invitation.role]}</td>
                  <td className={TD}>{formatDateTime(invitation.expiresAt)}</td>
                  <td className={TD}>
                    <Button
                      variant="ghost"
                      disabled={revoke.isPending}
                      aria-label={`Revocar invitación de ${invitation.email}`}
                      data-testid="invitation-revoke"
                      onClick={() => revoke.mutate(invitation.id)}
                    >
                      Revocar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </QueryBoundary>
    </Card>
  );
}

export function InviteDialog({ onClose, roleOptions }: { onClose: () => void; roleOptions: ReactNode }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("EDITOR");
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});

  const invite = useMutation({
    mutationFn: (input: InvitationInput) => api<InvitationCreated>("/admin/invitations", { method: "POST", body: input }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: keys.invitations });
      if (!created.inviteLink) onClose();
    },
  });

  if (invite.data?.inviteLink) {
    return (
      <Modal title="Invitación creada" onClose={onClose} testId="invite-dialog">
        <CopyableLink
          label={`Enlace de invitación para ${invite.data.email}`}
          link={invite.data.inviteLink}
          hint="No hay servidor de correo configurado. Envíale este enlace por un canal seguro: es de un solo uso, vence en 7 días y no se volverá a mostrar."
          testId="invite-link"
        />
      </Modal>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = InvitationInput.safeParse({ email: email.trim(), role });
    if (!parsed.success) {
      setClientErrors(zodFieldErrors(parsed.error));
      return;
    }
    setClientErrors({});
    invite.mutate(parsed.data);
  };

  const errors = { ...apiFieldErrors(invite.error), ...clientErrors };

  return (
    <Modal title="Invitar miembro" onClose={onClose} testId="invite-dialog">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3" data-testid="invite-member-form">
        <TextField
          label="Email"
          type="email"
          autoComplete="off"
          value={email}
          error={errors.email}
          hint="Recibirá un enlace de un solo uso, válido 7 días, para crear su contraseña. Sin servidor de correo, te lo mostramos para que se lo envíes."
          testId="invite-field-email"
          onChange={(e) => setEmail(e.target.value)}
        />
        <SelectField label="Rol" value={role} error={errors.role} testId="invite-field-role" onChange={(e) => setRole(e.target.value as Role)}>
          {roleOptions}
        </SelectField>
        <ErrorBanner error={invite.error} testId="invite-member-error" />
        <div>
          <Button type="submit" variant="primary" disabled={invite.isPending} data-testid="invite-send">
            {invite.isPending ? "Enviando…" : "Enviar invitación"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
