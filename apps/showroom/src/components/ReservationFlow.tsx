"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { ReservationInput, type DevelopmentManifest, type ReservationCreated, type Unit } from "@synapse/contracts";
import { INTL_LOCALE } from "@synapse/domain";
import { EmptyState, Price, Spinner } from "@synapse/ui";
import { useI18n } from "@/i18n/I18nProvider";
import type { Messages } from "@/i18n/messages";
import { payDeposit, ReservationError, startReservation, useReservationSettings } from "@/lib/reservations";
import { INPUT } from "./LeadForm";
import { ManifestGate } from "./ManifestGate";
import { BTN_PRIMARY } from "./UnitCard";

type Field = "name" | "email" | "phone" | "consent";
type Step = { name: "form" } | { name: "checkout"; reservation: ReservationCreated } | { name: "paid"; reservation: ReservationCreated };

const BTN_OUTLINE = "inline-flex min-h-11 items-center justify-center rounded-md border border-slate-400 px-6 text-sm font-semibold hover:bg-slate-100";

function errorMessage(error: unknown, t: Messages): string {
  const code = error instanceof ReservationError ? error.code : "unknown";
  const messages: Record<string, string> = {
    UNIT_NOT_AVAILABLE: t.reservation.unavailable,
    PAYMENT_DECLINED: t.reservation.declined,
    NOT_FOUND: t.reservation.expired,
    TOO_MANY: t.lead.tooMany,
    offline: t.lead.offline,
  };
  return messages[code] ?? t.reservation.failed;
}

function ReservationForm({ developmentSlug, unit, onCreated }: { developmentSlug: string; unit: Unit; onCreated: (r: ReservationCreated) => void }) {
  const uid = useId();
  const { t } = useI18n();
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const data = new FormData(e.currentTarget);
    const text = (k: string) => String(data.get(k) ?? "");
    const parsed = ReservationInput.safeParse({
      developmentSlug,
      unitId: unit.id,
      name: text("name"),
      email: text("email"),
      phone: text("phone") || undefined,
      consent: data.get("consent") === "on",
    });
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as Field;
        if (key in t.lead.fields && !next[key]) next[key] = t.lead.fields[key];
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setServerError(null);
    setSubmitting(true);
    try {
      onCreated(await startReservation(parsed.data));
    } catch (error) {
      setServerError(errorMessage(error, t));
    } finally {
      setSubmitting(false);
    }
  }

  const describedBy = (k: Field) => (errors[k] ? `${uid}-${k}-err` : undefined);
  const fieldError = (k: Field) =>
    errors[k] ? (
      <p id={describedBy(k)} role="alert" className="mt-1 text-sm text-red-700">
        {errors[k]}
      </p>
    ) : null;
  const textField = (k: "name" | "email" | "phone", label: string, type: string, autoComplete: string) => (
    <div>
      <label htmlFor={`${uid}-${k}`} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <input
        id={`${uid}-${k}`}
        name={k}
        type={type}
        autoComplete={autoComplete}
        data-testid={`reservation-${k}`}
        className={INPUT}
        aria-invalid={errors[k] ? true : undefined}
        aria-describedby={describedBy(k)}
      />
      {fieldError(k)}
    </div>
  );

  return (
    <form onSubmit={onSubmit} noValidate data-testid="reservation-form" aria-label={t.reservation.form} className="grid gap-4">
      {textField("name", t.lead.name, "text", "name")}
      {textField("email", t.lead.email, "email", "email")}
      {textField("phone", t.lead.phone, "tel", "tel")}
      <div>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="consent"
            data-testid="reservation-consent"
            className="mt-0.5 size-5 shrink-0 accent-[#b8924a]"
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={describedBy("consent")}
          />
          <span>{t.reservation.consent}</span>
        </label>
        {fieldError("consent")}
      </div>
      {serverError ? (
        <p role="alert" data-testid="reservation-error" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {serverError}
        </p>
      ) : null}
      <div>
        <button type="submit" disabled={submitting} aria-busy={submitting} data-testid="reservation-submit" className={`${BTN_PRIMARY} px-6`}>
          {submitting ? t.lead.sending : t.reservation.continue}
        </button>
      </div>
    </form>
  );
}

function MockCheckout({ reservation, onPaid }: { reservation: ReservationCreated; onPaid: () => void }) {
  const { t } = useI18n();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay(outcome: "approve" | "decline") {
    setPaying(true);
    setError(null);
    try {
      await payDeposit(reservation.id, { checkoutToken: reservation.checkoutToken, outcome });
      onPaid();
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setPaying(false);
    }
  }

  return (
    <section data-testid="reservation-checkout" aria-labelledby="checkout-title" className="grid gap-4">
      <h2 id="checkout-title" className="text-xl font-semibold">
        {t.reservation.checkoutTitle}
      </h2>
      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{t.reservation.mockNotice}</p>
      {error ? (
        <p role="alert" data-testid="reservation-error" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={paying} aria-busy={paying} onClick={() => void pay("approve")} data-testid="reservation-pay" className={`${BTN_PRIMARY} px-6`}>
          {t.reservation.pay}
        </button>
        <button type="button" disabled={paying} onClick={() => void pay("decline")} data-testid="reservation-decline" className={BTN_OUTLINE}>
          {t.reservation.simulateDecline}
        </button>
      </div>
    </section>
  );
}

function ReservationPage({ manifest, slug }: { manifest: DevelopmentManifest; slug: string }) {
  const { locale, t } = useI18n();
  const settings = useReservationSettings();
  const [step, setStep] = useState<Step>({ name: "form" });
  const unit = manifest.units.find((u) => u.slug === slug);

  if (!unit) return <EmptyState title={t.common.unitNotFound} description={t.sheet.notPublished} />;
  if (settings.isPending) return <Spinner label={t.common.loading} />;
  const offered = settings.data?.enabled && settings.data.depositAmount;
  const available = unit.status === "AVAILABLE" || step.name !== "form";
  const deposit = step.name === "form" ? { amount: settings.data?.depositAmount ?? "0", currency: unit.currency } : { amount: step.reservation.depositAmount, currency: step.reservation.currency };

  return (
    <article data-testid="reservation-page" className="mx-auto max-w-2xl px-4 py-10">
      <Link href={`/unidades/${unit.slug}`} className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-700 hover:underline">
        <ArrowLeft aria-hidden="true" size={16} /> {t.reservation.backToSheet(unit.name)}
      </Link>
      <h1 className="mt-2 text-3xl font-semibold">{t.reservation.title(unit.name)}</h1>

      {!offered || !available ? (
        <p data-testid="reservation-unavailable" className="mt-6 text-slate-700">
          {offered ? t.reservation.unavailable : t.reservation.disabled}
        </p>
      ) : (
        <>
          <p className="mt-2 text-slate-700">
            {t.reservation.depositIntro}{" "}
            <Price amount={deposit.amount} currency={deposit.currency} locale={INTL_LOCALE[locale]} className="font-semibold" />
          </p>
          <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
            {step.name === "form" ? (
              <ReservationForm developmentSlug={manifest.development.slug} unit={unit} onCreated={(reservation) => setStep({ name: "checkout", reservation })} />
            ) : step.name === "checkout" ? (
              <MockCheckout reservation={step.reservation} onPaid={() => setStep({ name: "paid", reservation: step.reservation })} />
            ) : (
              <div role="status" data-testid="reservation-paid" className="text-emerald-900">
                <p className="text-lg font-semibold">{t.reservation.paidTitle(step.reservation.unitCode)}</p>
                <p className="mt-1 text-sm">{t.reservation.paidText}</p>
              </div>
            )}
          </div>
        </>
      )}
    </article>
  );
}

export function ReservationRoute({ slug }: { slug: string }) {
  return <ManifestGate>{(manifest) => <ReservationPage manifest={manifest} slug={slug} />}</ManifestGate>;
}
