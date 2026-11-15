"use client";

import type { CSSProperties } from "react";
import type { Unit } from "@synapse/contracts";
import { STATUS_META } from "@synapse/domain";

export interface UnitListProps {
  units: Unit[];
  selectedUnitId: string | null;
  onSelect: (unitId: string | null) => void;
  onHover: (unitId: string | null) => void;
  /** `false`: invisible 1px buttons (keyboard/test alternative to picking). `true`: visible chips (WebGL fallback). */
  visible?: boolean;
}

const hiddenList: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: 1,
  height: 1,
  margin: 0,
  padding: 0,
  listStyle: "none",
  zIndex: 30,
};

/**
 * Accessible alternative to canvas picking. Hidden buttons are 1x1px, opacity 0 and stacked 1px apart
 * so they stay hit-testable (Playwright `click()` works) without being visible.
 */
export function UnitList({ units, selectedUnitId, onSelect, onHover, visible = false }: UnitListProps) {
  return (
    <ul
      aria-label="Unidades del masterplan"
      data-testid="masterplan-unit-list"
      style={visible ? { listStyle: "none", margin: 0, padding: 12, display: "flex", flexWrap: "wrap", gap: 8 } : hiddenList}
    >
      {units.map((unit, i) => {
        const selected = unit.id === selectedUnitId;
        return (
          <li key={unit.id} style={visible ? undefined : { position: "absolute", top: i, left: 0, width: 1, height: 1 }}>
            <button
              type="button"
              data-testid={`masterplan-unit-${unit.code}`}
              data-status={unit.status}
              aria-pressed={selected}
              onClick={() => onSelect(unit.id)}
              onFocus={() => onHover(unit.id)}
              onBlur={() => onHover(null)}
              style={
                visible
                  ? {
                      minHeight: 44,
                      padding: "0 16px",
                      borderRadius: 9999,
                      border: `2px solid ${STATUS_META[unit.status].color}`,
                      background: selected ? STATUS_META[unit.status].color : "#fff",
                      color: "#111827",
                      cursor: "pointer",
                    }
                  : { width: 1, height: 1, padding: 0, border: 0, overflow: "hidden", opacity: 0 }
              }
            >
              {unit.name} - {STATUS_META[unit.status].label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
