"use client";

import { UiStyles } from "./ui-styles";

export interface SpinnerProps {
  size?: number;
  label?: string;
  className?: string;
}

export function Spinner({ size = 28, label = "Cargando", className }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className={className} style={{ display: "inline-flex", color: "inherit" }}>
      <UiStyles />
      <span className="syn-ui-spinner" aria-hidden="true" style={{ width: size, height: size }} />
    </span>
  );
}
