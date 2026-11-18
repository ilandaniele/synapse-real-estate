"use client";

import type { CSSProperties } from "react";
import type { Unit } from "@synapse/contracts";
import { DEFAULT_LOCALE, STATUS_LABELS, STATUS_META, type Locale } from "@synapse/domain";
import { MASTERPLAN_STRINGS } from "./strings";

export interface UnitListProps {
  units: Unit[];
  selectedUnitId: string | null;
  onSelect: (unitId: string | null) => void;
  onHover: (unitId: string | null) => void;
  /** `false`: invisible 8px buttons (keyboard/test alternative to picking). `true`: visible chips (WebGL fallback). */
  visible?: boolean;
  locale?: Locale;
}

const HIDDEN_BUTTON_SIZE = 8;

const hiddenList: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: HIDDEN_BUTTON_SIZE,
  margin: 0,
  padding: 0,
  listStyle: "none",
  zIndex: 30,
};

/**
 * Accessible alternative to canvas picking. Hidden buttons are opacity 0 and stacked without overlap
 * so each one stays hit-testable (Playwright `click()` works) without being visible.
 */
export function UnitList({ units, selectedUnitId, onSelect, onHover, visible = false, locale = DEFAULT_LOCALE }: UnitListProps) {
  return (
    <ul
      aria-label={MASTERPLAN_STRINGS[locale].unitList}
      data-testid="masterplan-unit-list"
      style={visible ? { listStyle: "none", margin: 0, padding: 12, display: "flex", flexWrap: "wrap", gap: 8 } : hiddenList}
    >
      {units.map((unit, i) => {
        const selected = unit.id === selectedUnitId;
        return (
          <li key={unit.id} style={visible ? undefined : { position: "absolute", top: i * HIDDEN_BUTTON_SIZE, left: 0, width: HIDDEN_BUTTON_SIZE, height: HIDDEN_BUTTON_SIZE }}>
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
                  : { display: "block", width: HIDDEN_BUTTON_SIZE, height: HIDDEN_BUTTON_SIZE, padding: 0, border: 0, overflow: "hidden", opacity: 0 }
              }
            >
              {unit.name} - {STATUS_LABELS[locale][unit.status]}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
