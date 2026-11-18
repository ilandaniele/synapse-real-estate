"use client";

import { useState, type FormEvent } from "react";
import { DevelopmentInput } from "@synapse/contracts";
import type { z } from "zod";
import { apiFieldErrors, parseNumber, zodFieldErrors, type FieldErrors } from "@/lib/forms";
import { slugifyText } from "@/lib/format";
import { Button, ErrorBanner, TextAreaField, TextField } from "./ui";
import { EnglishFields, useEnglishText } from "./EnglishFields";

const ENGLISH_FIELDS = [
  { name: "tagline", label: "Eslogan" },
  { name: "description", label: "Descripción", multiline: true },
];

export type DevelopmentFormValues = z.infer<typeof DevelopmentInput>;

const EMPTY: DevelopmentFormValues = {
  name: "",
  slug: "",
  tagline: "",
  description: "",
  city: "",
  country: "ES",
  lat: 0,
  lng: 0,
  currency: "EUR",
};

export function DevelopmentForm({
  initial,
  disabled = false,
  pending = false,
  error,
  submitLabel,
  onSubmit,
}: {
  initial?: DevelopmentFormValues;
  disabled?: boolean;
  pending?: boolean;
  error?: unknown;
  submitLabel: string;
  onSubmit: (values: DevelopmentFormValues) => void;
}) {
  const base = initial ?? EMPTY;
  const [name, setName] = useState(base.name);
  const [slug, setSlug] = useState(base.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial));
  const [tagline, setTagline] = useState(base.tagline);
  const [description, setDescription] = useState(base.description);
  const [city, setCity] = useState(base.city);
  const [country, setCountry] = useState(base.country);
  const [lat, setLat] = useState(String(base.lat));
  const [lng, setLng] = useState(String(base.lng));
  const [currency, setCurrency] = useState(base.currency);
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const english = useEnglishText(base.translations);

  const errors = { ...apiFieldErrors(error), ...clientErrors };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = DevelopmentInput.safeParse({
      name: name.trim(),
      slug: slug.trim(),
      tagline,
      description,
      city,
      country,
      lat: parseNumber(lat),
      lng: parseNumber(lng),
      currency: currency.trim().toUpperCase(),
      translations: english.translations,
    });
    if (!parsed.success) {
      setClientErrors(zodFieldErrors(parsed.error));
      return;
    }
    setClientErrors({});
    onSubmit(parsed.data);
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-3 md:grid-cols-2" data-testid="development-form">
      <TextField
        label="Nombre"
        value={name}
        disabled={disabled}
        error={errors.name}
        testId="dev-field-name"
        onChange={(e) => {
          setName(e.target.value);
          if (!slugTouched) setSlug(slugifyText(e.target.value));
        }}
      />
      <TextField
        label="Slug"
        value={slug}
        disabled={disabled}
        error={errors.slug}
        hint="Minúsculas, números y guiones."
        testId="dev-field-slug"
        onChange={(e) => {
          setSlugTouched(true);
          setSlug(e.target.value);
        }}
      />
      <TextField label="Eslogan" className="md:col-span-2" value={tagline} disabled={disabled} error={errors.tagline} testId="dev-field-tagline" onChange={(e) => setTagline(e.target.value)} />
      <TextAreaField label="Descripción" className="md:col-span-2" value={description} disabled={disabled} error={errors.description} testId="dev-field-description" onChange={(e) => setDescription(e.target.value)} />
      <EnglishFields fields={ENGLISH_FIELDS} {...english} errors={errors} disabled={disabled} testId="dev-field-en" />
      <TextField label="Ciudad" value={city} disabled={disabled} error={errors.city} testId="dev-field-city" onChange={(e) => setCity(e.target.value)} />
      <TextField label="País" value={country} disabled={disabled} error={errors.country} testId="dev-field-country" onChange={(e) => setCountry(e.target.value)} />
      <TextField label="Latitud" inputMode="decimal" value={lat} disabled={disabled} error={errors.lat} testId="dev-field-lat" onChange={(e) => setLat(e.target.value)} />
      <TextField label="Longitud" inputMode="decimal" value={lng} disabled={disabled} error={errors.lng} testId="dev-field-lng" onChange={(e) => setLng(e.target.value)} />
      <TextField label="Moneda (ISO 4217)" maxLength={3} value={currency} disabled={disabled} error={errors.currency} testId="dev-field-currency" onChange={(e) => setCurrency(e.target.value)} />
      <div className="flex flex-col gap-2 md:col-span-2">
        <ErrorBanner error={error} testId="dev-form-error" />
        {disabled ? null : (
          <div>
            <Button type="submit" variant="primary" disabled={pending} data-testid="dev-save">
              {pending ? "Guardando…" : submitLabel}
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
