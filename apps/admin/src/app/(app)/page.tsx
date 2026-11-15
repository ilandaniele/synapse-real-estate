"use client";

import Link from "next/link";
import { JOB_STATUSES, STATUS_META, UNIT_STATUSES } from "@synapse/domain";
import { useDashboard } from "@/lib/queries";
import { formatDateTime, JOB_STATUS_LABELS } from "@/lib/format";
import { Card, PageHeader, QueryBoundary } from "@/components/ui";

export default function DashboardPage() {
  const dashboard = useDashboard();
  return (
    <>
      <PageHeader title="Resumen" description="Estado comercial, actividad de leads y procesos de importación." />
      <QueryBoundary query={dashboard}>
        {(data) => (
          <div className="grid gap-4 md:grid-cols-2" data-testid="dashboard">
            <Card title="Unidades por estado">
              <ul className="grid grid-cols-2 gap-3">
                {UNIT_STATUSES.map((status) => (
                  <li key={status} className="rounded-md border border-gray-200 p-3" data-testid={`dash-units-${status}`}>
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <span aria-hidden="true" className="inline-block size-2.5 rounded-full" style={{ background: STATUS_META[status].color }} />
                      {STATUS_META[status].label}
                    </div>
                    <div className="text-2xl font-semibold">{data.unitsByStatus[status] ?? 0}</div>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Leads (últimos 30 días)">
              <div className="text-4xl font-semibold" data-testid="dash-leads">
                {data.leadsLast30Days}
              </div>
              <Link href="/leads" className="mt-2 inline-block text-sm text-blue-700 underline">
                Ver leads
              </Link>
            </Card>
            <Card title="Última publicación">
              {data.lastPublication ? (
                <p data-testid="dash-publication">
                  <strong>{data.lastPublication.developmentName}</strong> · versión {data.lastPublication.version}
                  <br />
                  <span className="text-sm text-gray-600">
                    {formatDateTime(data.lastPublication.publishedAt)} por {data.lastPublication.publishedBy}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-gray-600" data-testid="dash-publication">
                  Todavía no se ha publicado ningún desarrollo.
                </p>
              )}
            </Card>
            <Card title="Procesos por estado">
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {JOB_STATUSES.map((status) => (
                  <li key={status} className="rounded-md border border-gray-200 p-3" data-testid={`dash-jobs-${status}`}>
                    <div className="text-sm text-gray-700">{JOB_STATUS_LABELS[status]}</div>
                    <div className="text-2xl font-semibold">{data.jobsByStatus[status] ?? 0}</div>
                  </li>
                ))}
              </ul>
              <Link href="/jobs" className="mt-2 inline-block text-sm text-blue-700 underline">
                Ver procesos
              </Link>
            </Card>
          </div>
        )}
      </QueryBoundary>
    </>
  );
}
