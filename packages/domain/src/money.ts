const DECIMAL = /^\d{1,12}(\.\d{1,2})?$/;

export function isValidDecimalAmount(amount: string): boolean {
  return DECIMAL.test(amount);
}

export function isValidCurrency(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

export function toMinorUnits(amount: string): bigint {
  if (!isValidDecimalAmount(amount)) throw new Error(`Invalid decimal amount: ${amount}`);
  const [whole = "0", fraction = ""] = amount.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

export function formatPrice(amount: string, currency: string, locale = "es-ES"): string {
  const minor = toMinorUnits(amount);
  const hasCents = minor % 100n !== 0n;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(Number(minor) / 100);
}
