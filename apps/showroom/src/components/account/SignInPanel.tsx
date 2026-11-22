"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { BuyerRegisterInput, LoginInput } from "@synapse/contracts";
import { GoogleSignInButton } from "@synapse/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useAuthProviders, useBuyerSignIn } from "@/lib/buyer";
import { buyerErrorKey, type BuyerErrorKey } from "@/lib/buyer-state";
import { INPUT } from "../LeadForm";
import { BTN_PRIMARY } from "../UnitCard";

type Mode = "login" | "register";
type Field = "name" | "email" | "password";
type FieldErrors = Partial<Record<Field, string>>;

const MODES: Mode[] = ["login", "register"];

function AccountInput({ id, field, label, type, autoComplete, hint, error }: {
  id: string;
  field: Field;
  label: string;
  type: string;
  autoComplete: string;
  hint?: string;
  error?: string;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={field}
        type={type}
        autoComplete={autoComplete}
        required
        data-testid={`buyer-${field}`}
        className={INPUT}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-600">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SignInPanel() {
  const uid = useId();
  const { locale, t } = useI18n();
  const [mode, setMode] = useState<Mode>("login");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [errorKey, setErrorKey] = useState<BuyerErrorKey | null>(null);
  const signIn = useBuyerSignIn();
  const providers = useAuthProviders();
  const googleClientId = providers.data?.google?.clientId;
  const tabLabel: Record<Mode, string> = { login: t.account.signInTab, register: t.account.registerTab };

  function switchMode(next: Mode) {
    setMode(next);
    setFieldErrors({});
    setErrorKey(null);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = (mode === "register" ? BuyerRegisterInput : LoginInput).safeParse(values);
    setErrorKey(null);
    if (!parsed.success) {
      const fields = new Set(parsed.error.issues.map((issue) => issue.path[0] as Field));
      setFieldErrors(Object.fromEntries([...fields].map((field) => [field, t.account.fields[field]])));
      return;
    }
    setFieldErrors({});
    const request = mode === "register" ? { kind: "register" as const, body: parsed.data as BuyerRegisterInput } : { kind: "login" as const, body: parsed.data };
    signIn.mutate(request, { onError: (error) => setErrorKey(buyerErrorKey(error, "password")) });
  }

  function onGoogleCredential(credential: string) {
    setErrorKey(null);
    signIn.mutate({ kind: "google", body: { credential } }, { onError: (error) => setErrorKey(buyerErrorKey(error, "google")) });
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm" data-testid="buyer-sign-in">
      <div role="tablist" aria-label={t.account.modes} className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            id={`${uid}-tab-${m}`}
            aria-selected={mode === m}
            aria-controls={`${uid}-panel`}
            tabIndex={mode === m ? 0 : -1}
            data-testid={`buyer-tab-${m}`}
            onClick={() => switchMode(m)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              const next = MODES[(MODES.indexOf(m) + 1) % MODES.length]!;
              switchMode(next);
              document.getElementById(`${uid}-tab-${next}`)?.focus();
            }}
            className={`min-h-11 rounded-md text-sm font-semibold transition-colors ${mode === m ? "bg-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
          >
            {tabLabel[m]}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${mode}`}>
        <form key={mode} onSubmit={onSubmit} noValidate data-testid="buyer-form" className="grid gap-4">
          {mode === "register" ? (
            <AccountInput id={`${uid}-name`} field="name" label={t.account.name} type="text" autoComplete="name" error={fieldErrors.name} />
          ) : null}
          <AccountInput id={`${uid}-email`} field="email" label={t.account.email} type="email" autoComplete="email" error={fieldErrors.email} />
          <AccountInput
            id={`${uid}-password`}
            field="password"
            label={t.account.password}
            type="password"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            hint={mode === "register" ? t.account.passwordHint : undefined}
            error={fieldErrors.password}
          />
          {errorKey ? (
            <p role="alert" data-testid="buyer-error" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
              {t.account.errors[errorKey]}
            </p>
          ) : null}
          <button type="submit" disabled={signIn.isPending} data-testid="buyer-submit" className={`${BTN_PRIMARY} justify-center disabled:opacity-60`}>
            {signIn.isPending ? t.account.submitting : mode === "register" ? t.account.register : t.account.signIn}
          </button>
        </form>
      </div>

      {googleClientId ? (
        <div className="mt-6 flex flex-col items-center gap-4">
          <p className="text-sm text-slate-500">{t.account.or}</p>
          <GoogleSignInButton
            clientId={googleClientId}
            locale={locale}
            testId="buyer-google"
            onCredential={onGoogleCredential}
            onError={() => setErrorKey("googleUnavailable")}
          />
        </div>
      ) : null}

      <p className="mt-6 text-center text-sm">
        <Link href="/privacidad" className="text-slate-600 underline underline-offset-2 hover:text-slate-900">
          {t.privacy.link}
        </Link>
      </p>
    </div>
  );
}
