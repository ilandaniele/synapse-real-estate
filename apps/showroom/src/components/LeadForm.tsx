"use client";

import { useId, useState, type FormEvent } from "react";
import { ApiError, LeadInput } from "@synapse/contracts";
import type { Unit } from "@synapse/contracts";
import { useI18n } from "@/i18n/I18nProvider";
import { LEADS_URL } from "@/lib/config";

type Field = "name" | "email" | "phone" | "message" | "consent";
type FieldErrors = Partial<Record<Field, string>>;

export const INPUT =
  "min-h-11 w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 aria-[invalid=true]:border-red-600";

interface LeadFormProps {
  developmentSlug: string;
  units: Unit[];
  /** Pre-selected unit (UUID) when the form lives on a unit sheet. */
  unitId?: string | null;
}

export function LeadForm({ developmentSlug, units, unitId = null }: LeadFormProps) {
  const uid = useId();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const { t } = useI18n();
  const fieldMessages: Record<Field, string> = t.lead.fields;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    const text = (k: string) => String(data.get(k) ?? "");

    const candidate = {
      developmentSlug,
      unitId: text("unitId") || null,
      name: text("name"),
      email: text("email"),
      phone: text("phone"),
      message: text("message"),
      consent: data.get("consent") === "on",
      website: text("website"),
    };
    const parsed = LeadInput.safeParse(candidate);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && key in fieldMessages && !(key in next)) {
          next[key as Field] = fieldMessages[key as Field];
        }
      }
      setErrors(next);
      setServerError(null);
      // Move focus to the first invalid field so keyboard and screen-reader users land on it.
      const first = (["name", "email", "phone", "message", "consent"] as Field[]).find((k) => next[k]);
      if (first) form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }

    setErrors({});
    setServerError(null);
    setSubmitting(true);
    try {
      const body = { ...parsed.data, phone: parsed.data.phone || undefined, message: parsed.data.message || undefined };
      const res = await fetch(LEADS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setDone(true);
        form.reset();
        return;
      }
      if (res.status === 429) {
        setServerError(t.lead.tooMany);
        return;
      }
      const err = ApiError.safeParse(await res.json().catch(() => null));
      setServerError(
        res.status === 400 || res.status === 422
          ? t.lead.rejected
          : err.success
            ? t.lead.failed
            : t.lead.failedStatus(res.status),
      );
    } catch {
      setServerError(t.lead.offline);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div
        role="status"
        data-testid="lead-success"
        className="rounded-xl border border-emerald-300 bg-emerald-50 p-6 text-emerald-900"
      >
        <p className="text-lg font-semibold">{t.lead.thanks}</p>
        <p className="mt-1 text-sm">{t.lead.thanksText}</p>
        <button
          type="button"
          onClick={() => setDone(false)}
          className="mt-4 inline-flex min-h-11 items-center rounded-md border border-emerald-700 px-4 text-sm font-medium"
        >
          {t.lead.sendAnother}
        </button>
      </div>
    );
  }

  const err = (k: Field) => (errors[k] ? `${uid}-${k}-err` : undefined);

  return (
    <form onSubmit={onSubmit} noValidate data-testid="lead-form" aria-label={t.lead.form} className="grid gap-4">
      <div>
        <label htmlFor={`${uid}-name`} className="mb-1 block text-sm font-medium">
          {t.lead.name} <span aria-hidden="true">*</span>
        </label>
        <input
          id={`${uid}-name`}
          name="name"
          type="text"
          autoComplete="name"
          required
          data-testid="lead-name"
          className={INPUT}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={err("name")}
        />
        {errors.name ? (
          <p id={err("name")} role="alert" className="mt-1 text-sm text-red-700">
            {errors.name}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-email`} className="mb-1 block text-sm font-medium">
            {t.lead.email} <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${uid}-email`}
            name="email"
            type="email"
            autoComplete="email"
            required
            data-testid="lead-email"
            className={INPUT}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={err("email")}
          />
          {errors.email ? (
            <p id={err("email")} role="alert" className="mt-1 text-sm text-red-700">
              {errors.email}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor={`${uid}-phone`} className="mb-1 block text-sm font-medium">
            {t.lead.phone}
          </label>
          <input
            id={`${uid}-phone`}
            name="phone"
            type="tel"
            autoComplete="tel"
            data-testid="lead-phone"
            className={INPUT}
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby={err("phone")}
          />
          {errors.phone ? (
            <p id={err("phone")} role="alert" className="mt-1 text-sm text-red-700">
              {errors.phone}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <label htmlFor={`${uid}-unit`} className="mb-1 block text-sm font-medium">
          {t.lead.unit}
        </label>
        <select
          id={`${uid}-unit`}
          name="unitId"
          data-testid="lead-unit"
          defaultValue={unitId ?? ""}
          className={INPUT}
        >
          <option value="">{t.lead.noUnit}</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.code})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${uid}-message`} className="mb-1 block text-sm font-medium">
          {t.lead.message}
        </label>
        <textarea
          id={`${uid}-message`}
          name="message"
          rows={4}
          maxLength={2100}
          data-testid="lead-message"
          className={INPUT}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={err("message")}
        />
        {errors.message ? (
          <p id={err("message")} role="alert" className="mt-1 text-sm text-red-700">
            {errors.message}
          </p>
        ) : null}
      </div>

      {/* Honeypot: off-screen, not focusable, hidden from assistive tech. Humans never fill it. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          {t.lead.honeypot}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" data-testid="lead-website" />
        </label>
      </div>

      <div>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="consent"
            data-testid="lead-consent"
            className="mt-0.5 size-5 shrink-0 accent-[#b8924a]"
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={err("consent")}
          />
          <span>
            {t.lead.consent} <span aria-hidden="true">*</span>
          </span>
        </label>
        {errors.consent ? (
          <p id={err("consent")} role="alert" className="mt-1 text-sm text-red-700">
            {errors.consent}
          </p>
        ) : null}
      </div>

      {serverError ? (
        <p role="alert" data-testid="lead-error" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {serverError}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          data-testid="lead-submit"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#0b1220] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#1b2740] disabled:cursor-wait disabled:opacity-60"
        >
          {submitting ? t.lead.sending : t.lead.submit}
        </button>
      </div>
    </form>
  );
}
