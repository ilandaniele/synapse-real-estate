import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from "@synapse/domain";

export const LOCALE_COOKIE = "locale";

/** The cookie wins; otherwise the first supported language of Accept-Language; otherwise Spanish. */
export function resolveLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookie)) return cookie;
  const preferred = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag = "", q] = part.trim().split(";q=");
      return { lang: tag.split("-")[0]!.toLowerCase(), q: q === undefined ? 1 : Number(q) };
    })
    .filter((p) => p.q > 0)
    .sort((a, b) => b.q - a.q)
    .find((p) => (LOCALES as readonly string[]).includes(p.lang));
  return preferred && isLocale(preferred.lang) ? preferred.lang : DEFAULT_LOCALE;
}
