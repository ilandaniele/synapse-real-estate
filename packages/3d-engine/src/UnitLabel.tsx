"use client";

import { Html } from "@react-three/drei";
import type { Unit } from "@synapse/contracts";
import { STATUS_META } from "@synapse/domain";
import type { Vec3 } from "./helpers";

export interface UnitLabelProps {
  unit: Unit;
  position: Vec3;
  selected: boolean;
  faded: boolean;
  onSelect: (unitId: string) => void;
  onHover: (unitId: string | null) => void;
}

/** HTML badge anchored above a villa: name + status dot. A real button, so it is keyboard/touch accessible. */
export function UnitLabel({ unit, position, selected, faded, onSelect, onHover }: UnitLabelProps) {
  const meta = STATUS_META[unit.status];
  return (
    <Html position={[position[0], position[1], position[2]]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <button
        type="button"
        className="syn-mp-label"
        data-testid={`masterplan-label-${unit.code}`}
        data-status={unit.status}
        aria-label={`${unit.name}, ${meta.label}`}
        aria-pressed={selected}
        onClick={() => onSelect(unit.id)}
        onPointerEnter={() => onHover(unit.id)}
        onPointerLeave={() => onHover(null)}
        onFocus={() => onHover(unit.id)}
        onBlur={() => onHover(null)}
        style={{
          pointerEvents: "auto",
          opacity: faded ? 0.45 : 1,
          borderColor: selected ? meta.color : "rgba(255,255,255,.9)",
          boxShadow: selected ? `0 0 0 3px ${meta.color}66` : "0 2px 8px rgba(0,0,0,.35)",
        }}
      >
        <span className="syn-mp-dot" aria-hidden="true" style={{ background: meta.color }} />
        {unit.name}
      </button>
    </Html>
  );
}
