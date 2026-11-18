"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { PasswordResetRequest } from "@synapse/contracts";
import { api } from "@/lib/api";
import { AuthCard, AuthNotice } from "@/components/AuthCard";
import { Button, ErrorBanner, TextField } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [localError, setLocalError] = useState<string | undefined>();

  const request = useMutation({
    mutationFn: (input: PasswordResetRequest) => api<void>("/auth/password-reset/request", { method: "POST", body: input }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = PasswordResetRequest.safeParse({ email: email.trim() });
    if (!parsed.success) {
      setLocalError("Introduce un email válido.");
      return;
    }
    setLocalError(undefined);
    request.mutate(parsed.data);
  };

  return (
    <AuthCard title="Recuperar contraseña" description="Te enviaremos un enlace para elegir una contraseña nueva.">
      {request.isSuccess ? (
        <AuthNotice testId="forgot-sent">Si existe una cuenta con ese email, te enviamos un enlace. Revisá tu bandeja de entrada.</AuthNotice>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-3" data-testid="forgot-form">
          <TextField label="Email" type="email" autoComplete="username" value={email} error={localError} testId="forgot-email" onChange={(e) => setEmail(e.target.value)} />
          <ErrorBanner error={request.error} testId="forgot-error" />
          <Button type="submit" variant="primary" disabled={request.isPending} data-testid="forgot-submit">
            {request.isPending ? "Enviando…" : "Enviar enlace"}
          </Button>
        </form>
      )}
      <Link href="/login" className="mt-3 inline-block text-sm text-blue-700 hover:underline">
        Volver a entrar
      </Link>
    </AuthCard>
  );
}
