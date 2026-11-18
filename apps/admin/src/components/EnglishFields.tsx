"use client";

import { useState } from "react";
import type { ContentTranslations } from "@synapse/domain";
import type { FieldErrors } from "@/lib/forms";
import { TextAreaField, TextField } from "./ui";

export interface EnglishField {
  name: string;
  label: string;
  multiline?: boolean;
}

type EnglishText = Record<string, string>;

/** English text being edited, plus the `translations` payload it maps to (blank fields left out). */
export function useEnglishText(translations: ContentTranslations | undefined) {
  const [english, setEnglish] = useState<EnglishText>(() => ({ ...(translations?.en as EnglishText | undefined) }));
  const filled = Object.entries(english)
    .map(([field, text]) => [field, text.trim()] as const)
    .filter(([, text]) => text !== "");
  return {
    english,
    setField: (field: string, text: string) => setEnglish((current) => ({ ...current, [field]: text })),
    translations: { en: Object.fromEntries(filled) },
  };
}

export function EnglishFields({
  fields,
  english,
  setField,
  errors,
  disabled,
  testId,
}: {
  fields: EnglishField[];
  english: EnglishText;
  setField: (field: string, text: string) => void;
  errors: FieldErrors;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <fieldset className="grid gap-3 rounded-md border border-gray-200 p-3 md:col-span-2 md:grid-cols-2" data-testid={testId}>
      <legend className="px-1 text-sm font-semibold">Inglés</legend>
      <p className="text-xs text-gray-500 md:col-span-2">Opcional. Quien navega en inglés ve el texto en español en los campos que quedan vacíos.</p>
      {fields.map(({ name, label, multiline }) => {
        const props = {
          label,
          value: english[name] ?? "",
          disabled,
          error: errors[`translations.en.${name}`],
          testId: `${testId}-${name}`,
        };
        return multiline ? (
          <TextAreaField key={name} className="md:col-span-2" {...props} onChange={(e) => setField(name, e.target.value)} />
        ) : (
          <TextField key={name} {...props} onChange={(e) => setField(name, e.target.value)} />
        );
      })}
    </fieldset>
  );
}
