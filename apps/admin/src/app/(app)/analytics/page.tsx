"use client";

import { useState } from "react";
import { ANALYTICS_RANGES, type Development } from "@synapse/contracts";
import { useDevelopments, useVisitAnalytics } from "@/lib/queries";
import { PageHeader, QueryBoundary, SelectField, TableShell, TD, TH } from "@/components/ui";

export default function AnalyticsPage() {
  const developments = useDevelopments();
  return (
    <>
      <PageHeader
        title="Analítica"
        description="Unidades y estancias más vistas en el showroom. Solo contadores diarios: sin cookies ni datos del visitante."
      />
      <QueryBoundary query={developments} isEmpty={(items) => items.length === 0} emptyTitle="No hay desarrollos">
        {(items) => <AnalyticsView developments={items} />}
      </QueryBoundary>
    </>
  );
}

function AnalyticsView({ developments }: { developments: Development[] }) {
  const [developmentId, setDevelopmentId] = useState(developments[0]!.id);
  const [days, setDays] = useState<number>(30);
  const analytics = useVisitAnalytics(developmentId, days);

  return (
    <>
      <div className="mb-4 mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField label="Desarrollo" value={developmentId} testId="analytics-development" onChange={(e) => setDevelopmentId(e.target.value)}>
          {developments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Periodo" value={days} testId="analytics-days" onChange={(e) => setDays(Number(e.target.value))}>
          {ANALYTICS_RANGES.map((range) => (
            <option key={range} value={range}>
              Últimos {range} días
            </option>
          ))}
        </SelectField>
      </div>
      <QueryBoundary query={analytics} isEmpty={(data) => data.units.length + data.scenes.length === 0} emptyTitle="Todavía no hay visitas en este periodo">
        {(data) => (
          <div className="grid gap-6 lg:grid-cols-2">
            <TableShell caption="Unidades más vistas" testId="analytics-units">
              <thead>
                <tr>
                  <th className={TH}>Unidad</th>
                  <th className={`${TH} text-right`}>Visitas</th>
                </tr>
              </thead>
              <tbody>
                {data.units.map((unit) => (
                  <tr key={unit.id} data-testid="analytics-unit-row">
                    <td className={TD}>
                      {unit.code} · {unit.name}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{unit.views}</td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
            <TableShell caption="Estancias más vistas" testId="analytics-scenes">
              <thead>
                <tr>
                  <th className={TH}>Estancia</th>
                  <th className={`${TH} text-right`}>Visitas</th>
                </tr>
              </thead>
              <tbody>
                {data.scenes.map((scene) => (
                  <tr key={scene.id} data-testid="analytics-scene-row">
                    <td className={TD}>{scene.unitCode ? `${scene.unitCode} · ${scene.name}` : scene.name}</td>
                    <td className={`${TD} text-right tabular-nums`}>{scene.views}</td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </div>
        )}
      </QueryBoundary>
    </>
  );
}
