"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { RESERVATION_STATUSES } from "@synapse/domain";
import { EmptyState, Price } from "@synapse/ui";
import { api } from "@/lib/api";
import { keys, useDevelopments, type ReservationsPage } from "@/lib/queries";
import { useCan } from "@/lib/session";
import { formatDateTime, RESERVATION_STATUS_LABELS } from "@/lib/format";
import { Button, PageHeader, QueryBoundary, SelectField, TableShell, TD, TH } from "@/components/ui";

const PAGE_SIZE = 20;

export default function ReservationsRoute() {
  const canRead = useCan("lead:read");
  if (!canRead) {
    return <EmptyState title="Sin permiso" description="Tu rol no puede consultar reservas." />;
  }
  return <ReservationsView />;
}

function ReservationsView() {
  const developments = useDevelopments();
  const [developmentId, setDevelopmentId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const reservations = useQuery({
    queryKey: keys.reservations({ developmentId, status, page }),
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (developmentId) params.set("developmentId", developmentId);
      if (status) params.set("status", status);
      return api<ReservationsPage>(`/admin/reservations?${params}`);
    },
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title="Reservas" description="Reservas con señal iniciadas desde el showroom. Un pago aprobado marca la unidad como reservada." />
      <div className="mb-4 mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          label="Desarrollo"
          value={developmentId}
          testId="reservations-filter-development"
          onChange={(e) => {
            setDevelopmentId(e.target.value);
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
          label="Estado"
          value={status}
          testId="reservations-filter-status"
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos</option>
          {RESERVATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {RESERVATION_STATUS_LABELS[s]}
            </option>
          ))}
        </SelectField>
      </div>
      <QueryBoundary
        query={reservations}
        isEmpty={(data) => data.total === 0}
        emptyTitle="Todavía no hay reservas"
        emptyDescription="Aparecerán aquí cuando un comprador reserve una unidad desde el showroom."
      >
        {(data) => {
          const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
          return (
            <>
              <TableShell caption="Reservas" testId="reservations-table">
                <thead>
                  <tr>
                    <th className={TH}>Fecha</th>
                    <th className={TH}>Unidad</th>
                    <th className={TH}>Comprador</th>
                    <th className={TH}>Email</th>
                    <th className={TH}>Señal</th>
                    <th className={TH}>Estado</th>
                    <th className={TH}>Referencia de pago</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r, i) => (
                    <tr key={r.id} data-testid={`reservation-row-${i}`}>
                      <td className={TD}>{formatDateTime(r.createdAt)}</td>
                      <td className={TD}>{r.unitCode}</td>
                      <td className={TD}>{r.name}</td>
                      <td className={TD}>{r.email}</td>
                      <td className={TD}>
                        <Price amount={r.depositAmount} currency={r.currency} />
                      </td>
                      <td className={TD} data-testid={`reservation-status-${i}`}>
                        {RESERVATION_STATUS_LABELS[r.status]}
                      </td>
                      <td className={TD}>{r.paymentRef ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
              <nav aria-label="Paginación" className="mt-3 flex items-center justify-between gap-3 text-sm">
                <span data-testid="reservations-count">
                  {data.total} reserva{data.total === 1 ? "" : "s"} · página {data.page} de {pages}
                </span>
                <span className="flex gap-2">
                  <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Anterior
                  </Button>
                  <Button disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                    Siguiente
                  </Button>
                </span>
              </nav>
            </>
          );
        }}
      </QueryBoundary>
    </>
  );
}
