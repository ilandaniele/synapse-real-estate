"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { PasswordResetConfirm } from "@synapse/contracts";
import { Spinner } from "@synapse/ui";
import { api } from "@/lib/api";
import { useHashToken } from "@/lib/hash-token";
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from "@/lib/forms";
import { AuthCard, AuthNotice } from "@/components/AuthCard";
import { Button, ErrorBanner, TextField } from "@/components/ui";

export default function ResetPasswordPage() {
  const token = useHashToken();
  const [password, setPassword] = useState("");
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});

  const confirm = useMutation({
    mutationFn: (input: PasswordResetConfirm) => api<void>("/auth/password-reset/confirm", { method: "POST", body: input }),
  });

  if (token === undefined) {
    return (
      <AuthCard title="Nueva contraseña">
        <Spinner label="Cargando…" />
      </AuthCard>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = PasswordResetConfirm.safeParse({ token, password });
    if (!parsed.success) {
      setClientErrors(zodFieldErrors(parsed.error));
      return;
    }
    setClientErrors({});
    confirm.mutate(parsed.data);
  };

  const errors = { ...apiFieldErrors(confirm.error), ...clientErrors };

  return (
    <AuthCard title="Nueva contraseña" description="Al cambiarla se cerrarán tus sesiones abiertas.">
      {!token ? (
        <AuthNotice tone="error" testId="reset-invalid">
          El enlace no es válido. Pedí uno nuevo.
        </AuthNotice>
      ) : confirm.isSuccess ? (
        <AuthNotice testId="reset-done">Contraseña actualizada. Ya podés entrar.</AuthNotice>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-3" data-testid="reset-form">
          <TextField
            label="Contraseña nueva"
            type="password"
            autoComplete="new-password"
            value={password}
            error={errors.password}
            hint="Mínimo 12 caracteres."
            testId="reset-password"
            onChange={(e) => setPassword(e.target.value)}
          />
          <ErrorBanner error={confirm.error} testId="reset-error" />
          <Button type="submit" variant="primary" disabled={confirm.isPending} data-testid="reset-submit">
            {confirm.isPending ? "Guardando…" : "Guardar contraseña"}
          </Button>
        </form>
      )}
      <div className="mt-3 flex gap-4 text-sm">
        <Link href="/login" className="text-blue-700 hover:underline">
          Entrar
        </Link>
        <Link href="/forgot-password" className="text-blue-700 hover:underline">
          Pedir otro enlace
        </Link>
      </div>
    </AuthCard>
  );
}
