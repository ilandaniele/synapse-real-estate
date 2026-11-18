import { INTL_LOCALE, type Locale } from "@synapse/domain";

export function formatArea(m2: number, locale: Locale): string {
  return `${new Intl.NumberFormat(INTL_LOCALE[locale]).format(m2)} m²`;
}
