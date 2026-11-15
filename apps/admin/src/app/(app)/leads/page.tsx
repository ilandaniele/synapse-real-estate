"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import type { Lead } from "@synapse/contracts";
import { EmptyState } from "@synapse/ui";
import { api, downloadFile } from "@/lib/api";
import { keys, useDevelopments, useUnits, type LeadsPage } from "@/lib/queries";
import { useCan } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { Button, ErrorBanner, PageHeader, QueryBoundary, SelectField, TableShell, TD, TH } from "@/components/ui";

const PAGE_SIZE = 20;

export default function LeadsPage() {
  const canRead = useCan("lead:read");
  if (!canRead) {
    return <EmptyState title="Sin permiso" description="Tu rol no puede consultar leads." />;
  }
  return <LeadsView />;
}

function LeadsView() {
  const canExport = useCan("lead:export");
  const developments = useDevelopments();
  const [developmentId, setDevelopmentId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const units = useUnits(developmentId);

  const filters = { developmentId, unitId, page };
  const leads = useQuery({
    queryKey: keys.leads(filters),
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (developmentId) params.set("developmentId", developmentId);
      if (unitId) params.set("unitId", unitId);
      return api<LeadsPage>(`/admin/leads?${params}`);
    },
    placeholderData: keepPreviousData,
  });

  const exportCsv = useMutation({
    mutationFn: () => {
      const params = new URLSearchParams();
      if (developmentId) params.set("developmentId", developmentId);
      if (unitId) params.set("unitId", unitId);
      const query = params.size > 0 ? `?${params}` : "";
      return downloadFile(`/admin/leads/export.csv${query}`, "leads.csv");
    },
  });

  return (
    <>
      <PageHeader
        title="Leads"
        description="Contactos recibidos desde el showroom público."
        actions={
          canExport ? (
            <Button onClick={() => exportCsv.mutate()} disabled={exportCsv.isPending} data-testid="leads-export">
              {exportCsv.isPending ? "Exportando…" : "Exportar CSV"}
            </Button>
          ) : undefined
        }
      />
      <ErrorBanner error={exportCsv.error} testId="leads-export-error" />
      <div className="mb-4 mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          label="Desarrollo"
          value={developmentId}
          testId="leads-filter-development"
          onChange={(e) => {
            setDevelopmentId(e.target.value);
            setUnitId("");
            setPage(1);
          }}
        >
          <option value="">Todos</option>
          {(developments.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Unidad"
          value={unitId}
          disabled={!developmentId}
          hint={developmentId ? undefined : "Elige primero un desarrollo."}
          testId="leads-filter-unit"
          onChange={(e) => {
            setUnitId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas</option>
          {(units.data ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.code} · {u.name}
            </option>
          ))}
        </SelectField>
      </div>
      <QueryBoundary query={leads} isEmpty={(data) => data.total === 0} emptyTitle="Todavía no hay leads" emptyDescription="Aparecerán aquí cuando un visitante envíe el formulario del showroom.">
        {(data) => {
          const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
          return (
            <>
              <TableShell caption="Leads" testId="leads-table">
                <thead>
                  <tr>
                    <th className={TH}>Fecha</th>
                    <th className={TH}>Nombre</th>
                    <th className={TH}>Email</th>
                    <th className={TH}>Teléfono</th>
                    <th className={TH}>Unidad</th>
                    <th className={TH}>Origen</th>
                    <th className={TH}>
                      <span className="sr-only">Detalle</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((lead, i) => (
                    <tr key={lead.id} data-testid={`lead-row-${i}`}>
                      <td className={TD}>{formatDateTime(lead.createdAt)}</td>
                      <td className={TD}>{lead.name}</td>
                      <td className={TD}>{lead.email}</td>
                      <td className={TD}>{lead.phone ?? "—"}</td>
                      <td className={TD}>{lead.unitCode ?? "—"}</td>
                      <td className={TD}>{lead.source}</td>
                      <td className={TD}>
                        <Button onClick={() => setOpenId(lead.id)} data-testid={`lead-open-${i}`} aria-label={`Ver detalle de ${lead.name}`}>
                          Detalle
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
              <nav aria-label="Paginación" className="mt-3 flex items-center justify-between gap-3 text-sm">
                <span data-testid="leads-count">
                  {data.total} lead{data.total === 1 ? "" : "s"} · página {data.page} de {pages}
                </span>
                <span className="flex gap-2">
                  <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="leads-prev">
                    Anterior
                  </Button>
                  <Button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} data-testid="leads-next">
                    Siguiente
                  </Button>
                </span>
              </nav>
            </>
          );
        }}
      </QueryBoundary>
      {openId ? <LeadDrawer id={openId} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}

function LeadDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const lead = useQuery({ queryKey: keys.lead(id), queryFn: () => api<Lead>(`/admin/leads/${id}`) });
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Detalle del lead"
        data-testid="lead-drawer"
        className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl"
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Detalle del lead</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Cerrar detalle" data-testid="lead-drawer-close" autoFocus>
            ✕
          </Button>
        </div>
        <QueryBoundary query={lead}>
          {(l) => (
            <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="font-medium text-gray-700">Nombre</dt>
              <dd>{l.name}</dd>
              <dt className="font-medium text-gray-700">Email</dt>
              <dd>{l.email}</dd>
              <dt className="font-medium text-gray-700">Teléfono</dt>
              <dd>{l.phone ?? "—"}</dd>
              <dt className="font-medium text-gray-700">Unidad</dt>
              <dd>{l.unitCode ?? "—"}</dd>
              <dt className="font-medium text-gray-700">Origen</dt>
              <dd>{l.source}</dd>
              <dt className="font-medium text-gray-700">Recibido</dt>
              <dd>{formatDateTime(l.createdAt)}</dd>
              <dt className="font-medium text-gray-700">Mensaje</dt>
              <dd className="whitespace-pre-wrap">{l.message ?? "—"}</dd>
            </dl>
          )}
        </QueryBoundary>
      </aside>
    </div>
  );
}
