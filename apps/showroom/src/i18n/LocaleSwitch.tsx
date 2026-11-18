"use client";

import { LOCALES } from "@synapse/domain";
import { useI18n } from "./I18nProvider";

export function LocaleSwitch() {
  const { locale, t, setLocale } = useI18n();
  return (
    <div role="group" aria-label={t.header.language} className="flex shrink-0 items-center gap-1" data-testid="locale-switch">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === locale}
          data-testid={`locale-${l}`}
          onClick={() => setLocale(l)}
          className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-xs font-semibold uppercase transition-colors ${
            l === locale ? "bg-white/15 text-[#f0d79a]" : "text-white/70 hover:bg-white/10 hover:text-white"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
