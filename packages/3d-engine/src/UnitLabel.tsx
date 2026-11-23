"use client";

import { Html } from "@react-three/drei";
import type { Unit } from "@synapse/contracts";
import { STATUS_META } from "@synapse/domain";
import type { Vec3 } from "./helpers";

export interface UnitLabelProps {
  unit: Unit;
  position: Vec3;
  statusLabel: string;
  selected: boolean;
  faded: boolean;
  onSelect: (unitId: string) => void;
  onHover: (unitId: string | null) => void;
}

/** Label clicks bubble into the canvas container, where R3F would otherwise report them as a click on empty space. */
export function isLabelEvent(event: Event): boolean {
  return event.target instanceof Element && event.target.closest(".syn-mp-label") !== null;
}

/** HTML badge standing on a stem above a villa: name + status dot. A real button, so it is keyboard/touch accessible. */
export function UnitLabel({ unit, position, statusLabel, selected, faded, onSelect, onHover }: UnitLabelProps) {
  const meta = STATUS_META[unit.status];
  return (
    <Html position={[position[0], position[1], position[2]]} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <div className="syn-mp-anchor">
        <button
          type="button"
          className="syn-mp-label"
          data-testid={`masterplan-label-${unit.code}`}
          data-status={unit.status}
          aria-label={`${unit.name}, ${statusLabel}`}
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
        <span className="syn-mp-stem" aria-hidden="true" />
      </div>
    </Html>
  );
}
