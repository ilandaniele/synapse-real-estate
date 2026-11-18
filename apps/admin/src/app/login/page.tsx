"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoginInput, type SessionUser } from "@synapse/contracts";
import { api, errorMessage, ApiRequestError } from "@/lib/api";
import { keys } from "@/lib/queries";
import { Button, TextField } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: (input: { email: string; password: string }) => api<SessionUser>("/auth/login", { method: "POST", body: input }),
    onSuccess: (user) => {
      queryClient.setQueryData(keys.me, user);
      router.replace("/");
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const parsed = LoginInput.safeParse({ email: email.trim(), password });
    if (!parsed.success) {
      setLocalError("Introduce un email válido y una contraseña de al menos 8 caracteres.");
      return;
    }
    login.mutate(parsed.data);
  };

  const serverError =
    login.error instanceof ApiRequestError && login.error.status === 401
      ? "Email o contraseña incorrectos."
      : login.error
        ? errorMessage(login.error)
        : null;
  const message = localError ?? serverError;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={onSubmit} noValidate className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm" aria-labelledby="login-title">
        <h1 id="login-title" className="mb-1 text-xl font-semibold">
          Backoffice Synapse
        </h1>
        <p className="mb-4 text-sm text-gray-600">Accede con tu cuenta de la inmobiliaria.</p>
        <div className="flex flex-col gap-3">
          <TextField label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} testId="login-email" />
          <TextField label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} testId="login-password" />
          {message ? (
            <p role="alert" data-testid="login-error" className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-900">
              {message}
            </p>
          ) : null}
          <Button type="submit" variant="primary" disabled={login.isPending} data-testid="login-submit">
            {login.isPending ? "Entrando…" : "Entrar"}
          </Button>
          <Link href="/forgot-password" className="text-sm text-blue-700 hover:underline" data-testid="login-forgot">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
      </form>
    </main>
  );
}
