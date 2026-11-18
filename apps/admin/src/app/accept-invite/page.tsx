"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { InvitationAccept, type InvitationPreview, type SessionUser } from "@synapse/contracts";
import { Spinner } from "@synapse/ui";
import { api } from "@/lib/api";
import { useHashToken } from "@/lib/hash-token";
import { keys } from "@/lib/queries";
import { ROLE_LABELS } from "@/lib/format";
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from "@/lib/forms";
import { AuthCard, AuthNotice } from "@/components/AuthCard";
import { Button, ErrorBanner, TextField } from "@/components/ui";

const INVALID_LINK = "El enlace de invitación no es válido, ya se usó o venció. Pedí una nueva invitación.";

export default function AcceptInvitePage() {
  const token = useHashToken();
  const preview = useQuery({
    queryKey: ["invitation-preview", token],
    queryFn: () => api<InvitationPreview>("/auth/invitations/preview", { method: "POST", body: { token } }),
    enabled: Boolean(token),
    retry: false,
  });

  if (token === undefined || preview.isLoading) {
    return (
      <AuthCard title="Invitación">
        <Spinner label="Comprobando la invitación…" />
      </AuthCard>
    );
  }
  if (!token || preview.isError || !preview.data) {
    return (
      <AuthCard title="Invitación">
        <AuthNotice tone="error" testId="invite-invalid">
          {INVALID_LINK}
        </AuthNotice>
      </AuthCard>
    );
  }
  return <AcceptForm token={token} invitation={preview.data} />;
}

function AcceptForm({ token, invitation }: { token: string; invitation: InvitationPreview }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});

  const accept = useMutation({
    mutationFn: (input: InvitationAccept) => api<SessionUser>("/auth/invitations/accept", { method: "POST", body: input }),
    onSuccess: (user) => {
      queryClient.setQueryData(keys.me, user);
      router.replace("/");
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = InvitationAccept.safeParse({ token, name: name.trim(), password });
    if (!parsed.success) {
      setClientErrors(zodFieldErrors(parsed.error));
      return;
    }
    setClientErrors({});
    accept.mutate(parsed.data);
  };

  const errors = { ...apiFieldErrors(accept.error), ...clientErrors };

  return (
    <AuthCard
      title={`Unite a ${invitation.organizationName}`}
      description={`Creá tu cuenta para ${invitation.email} con el rol ${ROLE_LABELS[invitation.role]}.`}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3" data-testid="invite-form">
        <TextField label="Nombre" autoComplete="name" value={name} error={errors.name} testId="invite-name" onChange={(e) => setName(e.target.value)} />
        <TextField
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          value={password}
          error={errors.password}
          hint="Mínimo 12 caracteres."
          testId="invite-password"
          onChange={(e) => setPassword(e.target.value)}
        />
        <ErrorBanner error={accept.error} testId="invite-error" />
        <Button type="submit" variant="primary" disabled={accept.isPending} data-testid="invite-submit">
          {accept.isPending ? "Creando cuenta…" : "Crear cuenta"}
        </Button>
        <Link href="/login" className="text-sm text-blue-700 hover:underline">
          Ya tengo cuenta
        </Link>
      </form>
    </AuthCard>
  );
}
