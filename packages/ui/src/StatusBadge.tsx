"use client";

import { STATUS_META, type UnitStatus } from "@synapse/domain";

export interface StatusBadgeProps {
  status: UnitStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const meta = STATUS_META[status];
  return (
    <span
      data-testid="status-badge"
      data-status={status}
      className={className ?? "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        borderRadius: 9999,
        padding: "2px 10px",
        fontSize: 12,
        fontWeight: 600,
        color: "#111827",
        background: `${meta.color}26`,
        border: `1px solid ${meta.color}`,
      }}
    >
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 9999, background: meta.color }} />
      {meta.label}
    </span>
  );
}
