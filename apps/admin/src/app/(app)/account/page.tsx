"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PasswordChangeInput } from "@synapse/contracts";
import { api, ApiRequestError } from "@/lib/api";
import { keys } from "@/lib/queries";
import { useUser } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/format";
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from "@/lib/forms";
import { Button, Card, ErrorBanner, PageHeader, TextField } from "@/components/ui";

function passwordError(error: unknown): unknown {
  const wrongCurrent = error instanceof ApiRequestError && error.status === 400 && Object.keys(apiFieldErrors(error)).length === 0;
  return wrongCurrent ? new Error("La contraseña actual no es correcta.") : error;
}

export default function AccountPage() {
  const user = useUser();
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});

  const change = useMutation({
    mutationFn: (input: PasswordChangeInput) => api<void>("/auth/password", { method: "POST", body: input }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      void queryClient.invalidateQueries({ queryKey: keys.me });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = PasswordChangeInput.safeParse({ currentPassword, newPassword });
    const errors: FieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error);
    if (confirmation !== newPassword) errors.confirmation = "Las contraseñas no coinciden.";
    if (!parsed.success || Object.keys(errors).length > 0) {
      setClientErrors(errors);
      return;
    }
    setClientErrors({});
    change.mutate(parsed.data);
  };

  const errors = { ...apiFieldErrors(change.error), ...clientErrors };

  return (
    <>
      <PageHeader title="Mi cuenta" description={`${user.email} · ${ROLE_LABELS[user.role]} · ${user.organizationName}`} />
      <Card title="Cambiar contraseña">
        <form onSubmit={submit} noValidate className="flex max-w-md flex-col gap-3" data-testid="password-form">
          <TextField label="Contraseña actual" type="password" autoComplete="current-password" value={currentPassword} error={errors.currentPassword} testId="password-current" onChange={(e) => setCurrentPassword(e.target.value)} />
          <TextField label="Nueva contraseña" type="password" autoComplete="new-password" value={newPassword} error={errors.newPassword} hint="Mínimo 12 caracteres." testId="password-new" onChange={(e) => setNewPassword(e.target.value)} />
          <TextField label="Repite la nueva contraseña" type="password" autoComplete="new-password" value={confirmation} error={errors.confirmation} testId="password-confirm" onChange={(e) => setConfirmation(e.target.value)} />
          <ErrorBanner error={passwordError(change.error)} testId="password-error" />
          {change.isSuccess ? (
            <p role="status" data-testid="password-saved" className="text-sm text-green-800">
              Contraseña actualizada. Se cerraron tus otras sesiones.
            </p>
          ) : null}
          <div>
            <Button type="submit" variant="primary" disabled={change.isPending} data-testid="password-save">
              {change.isPending ? "Guardando…" : "Cambiar contraseña"}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
