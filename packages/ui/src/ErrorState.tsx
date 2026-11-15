"use client";

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({ message, onRetry, retryLabel = "Reintentar", className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      data-testid="error-state"
      className={className}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 24, textAlign: "center" }}
    >
      <p style={{ margin: 0 }}>{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          data-testid="error-retry"
          style={{ minHeight: 44, padding: "0 20px", borderRadius: 8, border: "1px solid currentColor", background: "transparent", color: "inherit", cursor: "pointer" }}
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
