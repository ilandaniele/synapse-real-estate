"use client";

import type { EntityChange, PublicationDiffSection } from "@synapse/contracts";
import { usePublicationDiff } from "@/lib/queries";
import { QueryBoundary } from "../ui";

const SECTION_LABELS: Record<PublicationDiffSection, string> = {
  development: "Desarrollo",
  units: "Unidades",
  scenes: "Escenas 360",
  floorPlans: "Planos",
  gallery: "Galería",
  pointsOfInterest: "Puntos de interés",
};

const KIND_LABELS: Record<EntityChange["kind"], string> = {
  added: "Añadido",
  removed: "Eliminado",
  changed: "Modificado",
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return `${value.length} elementos`;
  if (typeof value === "object") return JSON.stringify(value).slice(0, 80);
  return String(value);
}

export function PublicationDiffView({ developmentId, from, to }: { developmentId: string; from: number; to: number }) {
  const diff = usePublicationDiff(developmentId, from, to);
  return (
    <QueryBoundary query={diff} isEmpty={(d) => d.changes.length === 0} emptyTitle={`Sin diferencias entre v${from} y v${to}`}>
      {(d) => (
        <ul className="flex flex-col gap-2 text-sm" data-testid="publication-diff">
          {d.changes.map((c) => (
            <li key={`${c.section}-${c.id}`} className="rounded-md border border-gray-200 p-2" data-testid={`diff-${c.section}-${c.kind}`}>
              <p>
                <span className="font-medium">{KIND_LABELS[c.kind]}</span> · {SECTION_LABELS[c.section]} · {c.label}
              </p>
              {c.fields.length > 0 ? (
                <ul className="mt-1 pl-4 text-gray-700">
                  {c.fields.map((f) => (
                    <li key={f.field}>
                      <code className="rounded bg-gray-100 px-1">{f.field}</code>: {formatValue(f.before)} → {formatValue(f.after)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </QueryBoundary>
  );
}
