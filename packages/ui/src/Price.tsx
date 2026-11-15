"use client";

import { formatPrice } from "@synapse/domain";

export interface PriceProps {
  amount: string;
  currency: string;
  locale?: string;
  className?: string;
}

/** Renders a decimal-string amount; shows an em dash when the amount is not a valid decimal. */
export function Price({ amount, currency, locale, className }: PriceProps) {
  let text: string;
  try {
    text = formatPrice(amount, currency, locale);
  } catch {
    text = "—";
  }
  return (
    <span data-testid="price" className={className}>
      {text}
    </span>
  );
}
