"use client";

import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      className={className}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 24, textAlign: "center" }}
    >
      <p style={{ margin: 0, fontWeight: 600 }}>{title}</p>
      {description ? <p style={{ margin: 0, opacity: 0.75 }}>{description}</p> : null}
      {action}
    </div>
  );
}
