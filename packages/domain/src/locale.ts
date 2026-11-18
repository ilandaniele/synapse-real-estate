export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";

/** BCP 47 tags for Intl number and date formatting. */
export const INTL_LOCALE: Record<Locale, string> = { es: "es-ES", en: "en-GB" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Locales whose content is entered as a translation of the base (DEFAULT_LOCALE) text. */
export const TRANSLATED_LOCALES = ["en"] as const satisfies readonly Exclude<Locale, typeof DEFAULT_LOCALE>[];
export type TranslatedLocale = (typeof TRANSLATED_LOCALES)[number];

/** Per-locale overrides of an entity's text fields, e.g. `{ en: { name: "Living room" } }`. */
export type ContentTranslations = Partial<Record<TranslatedLocale, Record<string, string | undefined>>>;

/** The entity with its non-blank `locale` translations laid over the base-language fields. */
export function localize<T extends { translations?: ContentTranslations }>(entity: T, locale: Locale): T {
  const overrides = locale === DEFAULT_LOCALE ? undefined : entity.translations?.[locale as TranslatedLocale];
  if (!overrides) return entity;
  const filled = Object.entries(overrides).filter(([, text]) => typeof text === "string" && text.trim() !== "");
  return { ...entity, ...Object.fromEntries(filled) };
}
