"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Job } from "@synapse/contracts";
import { canRetry, MAX_JOB_ATTEMPTS, type JobStatus } from "@synapse/domain";
import { api } from "@/lib/api";
import { isActiveJob, keys, useAssets, useJob, useJobs } from "@/lib/queries";
import { useCan } from "@/lib/session";
import { formatDateTime, JOB_STATUS_LABELS } from "@/lib/format";
import { Button, Card, ErrorBanner, PageHeader, QueryBoundary, TableShell, TD, TextAreaField, TH } from "@/components/ui";

const BADGE: Record<JobStatus, string> = {
  PENDING: "bg-gray-100 text-gray-800 border-gray-300",
  PROCESSING: "bg-blue-100 text-blue-900 border-blue-300",
  REQUIRES_REVIEW: "bg-amber-100 text-amber-900 border-amber-300",
  COMPLETED: "bg-green-100 text-green-900 border-green-300",
  FAILED: "bg-red-100 text-red-900 border-red-300",
};

function JobBadge({ status }: { status: JobStatus }) {
  return (
    <span data-testid="job-status" data-status={status} className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${BADGE[status]}`}>
      {JOB_STATUS_LABELS[status]}
    </span>
  );
}

interface Suggestion {
  meshName: string;
  unitCode?: string;
  unitId?: string | null;
}

function suggestionsOf(job: Job): Suggestion[] {
  const raw = job.result?.suggestions;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): Suggestion[] => {
    if (!item || typeof item !== "object") return [];
    const r = item as Record<string, unknown>;
    if (typeof r.meshName !== "string") return [];
    return [{ meshName: r.meshName, unitCode: typeof r.unitCode === "string" ? r.unitCode : undefined, unitId: typeof r.unitId === "string" ? r.unitId : null }];
  });
}

export default function JobsPage() {
  const jobs = useJobs();
  const assets = useAssets();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filenameById = new Map((assets.data ?? []).map((a) => [a.id, a.filename]));
  const polling = jobs.data?.some(isActiveJob) ?? false;

  return (
    <>
      <PageHeader title="Procesos" description="Importaciones de GLB y panoramas. Los resultados con mapeos sugeridos requieren revisión manual." />
      {polling ? (
        <p role="status" data-testid="jobs-polling" className="mb-3 text-sm text-gray-600">
          Hay procesos activos: la lista se actualiza cada 3 segundos.
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_26rem]">
        <QueryBoundary query={jobs} isEmpty={(items) => items.length === 0} emptyTitle="Todavía no hay procesos" emptyDescription="Sube un archivo en Activos y pulsa «Procesar».">
          {(items) => (
            <TableShell caption="Procesos" testId="jobs-table">
              <thead>
                <tr>
                  <th className={TH}>Tipo</th>
                  <th className={TH}>Archivo</th>
                  <th className={TH}>Estado</th>
                  <th className={TH}>Intentos</th>
                  <th className={TH}>Actualizado</th>
                  <th className={TH}>
                    <span className="sr-only">Detalle</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((job, i) => (
                  <tr key={job.id} data-testid={`job-row-${i}`} data-status={job.status} className={selectedId === job.id ? "bg-blue-50" : undefined}>
                    <td className={TD}>{job.kind}</td>
                    <td className={TD}>{job.assetId ? (filenameById.get(job.assetId) ?? job.assetId.slice(0, 8)) : "—"}</td>
                    <td className={TD}>
                      <JobBadge status={job.status} />
                    </td>
                    <td className={TD}>{job.attempts}</td>
                    <td className={TD}>{formatDateTime(job.updatedAt)}</td>
                    <td className={TD}>
                      <Button onClick={() => setSelectedId(job.id)} aria-pressed={selectedId === job.id} data-testid={`job-open-${i}`} aria-label={`Ver detalle del proceso ${i + 1}`}>
                        Detalle
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </QueryBoundary>
        <div>{selectedId ? <JobDetail id={selectedId} /> : <Card>Elige un proceso para ver sus registros y resultado.</Card>}</div>
      </div>
    </>
  );
}

function JobDetail({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const canCreate = useCan("job:create");
  const job = useJob(id);
  const [note, setNote] = useState("");

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.jobs });
    void queryClient.invalidateQueries({ queryKey: keys.job(id) });
    void queryClient.invalidateQueries({ queryKey: keys.dashboard });
  };
  const retry = useMutation({ mutationFn: () => api<Job>(`/admin/jobs/${id}/retry`, { method: "POST" }), onSuccess: refresh });
  const review = useMutation({
    mutationFn: (decision: "approve" | "reject") => api<Job>(`/admin/jobs/${id}/review`, { method: "POST", body: { decision, ...(note.trim() ? { note: note.trim() } : {}) } }),
    onSuccess: refresh,
  });

  return (
    <Card title="Detalle del proceso" className="sticky top-4">
      <QueryBoundary query={job}>
        {(j) => {
          const suggestions = suggestionsOf(j);
          return (
            <div className="flex flex-col gap-3 text-sm" data-testid="job-detail">
              <div className="flex items-center justify-between gap-2">
                <JobBadge status={j.status} />
                <span className="text-xs text-gray-600">
                  Intentos {j.attempts}/{MAX_JOB_ATTEMPTS}
                </span>
              </div>
              {j.error ? (
                <p role="alert" data-testid="job-error" className="rounded-md border border-red-300 bg-red-50 p-2 text-red-900">
                  {j.error}
                </p>
              ) : null}
              {j.logs.length > 0 ? (
                <div>
                  <h3 className="mb-1 font-semibold">Registros</h3>
                  <ul className="max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-2 font-mono text-xs" data-testid="job-logs">
                    {j.logs.map((log, i) => (
                      <li key={i} className={log.level === "error" ? "text-red-800" : log.level === "warn" ? "text-amber-800" : ""}>
                        {new Date(log.at).toLocaleTimeString("es-ES")} [{log.level}] {log.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {suggestions.length > 0 ? (
                <div>
                  <h3 className="mb-1 font-semibold">Mapeo sugerido malla → unidad</h3>
                  <TableShell caption="Mapeo sugerido de mallas a unidades" testId="job-suggestions">
                    <thead>
                      <tr>
                        <th className={TH}>Malla</th>
                        <th className={TH}>Unidad</th>
                        <th className={TH}>Coincidencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suggestions.map((s) => (
                        <tr key={s.meshName}>
                          <td className={TD}>
                            <code>{s.meshName}</code>
                          </td>
                          <td className={TD}>{s.unitCode ?? "—"}</td>
                          <td className={TD}>{s.unitId ? "Sí" : "Sin unidad"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </TableShell>
                  <p className="mt-1 text-xs text-gray-600">Al aprobar solo se guardan las mallas con unidad coincidente.</p>
                </div>
              ) : null}
              {j.result ? (
                <details>
                  <summary className="cursor-pointer font-semibold">Resultado (JSON)</summary>
                  <pre data-testid="job-result" className="mt-1 max-h-64 overflow-auto rounded-md bg-gray-50 p-2 text-xs">
                    {JSON.stringify(j.result, null, 2)}
                  </pre>
                </details>
              ) : null}
              <ErrorBanner error={retry.error ?? review.error} testId="job-action-error" />
              {j.status === "REQUIRES_REVIEW" && canCreate ? (
                <div className="flex flex-col gap-2 border-t border-gray-200 pt-3" data-testid="job-review">
                  <TextAreaField label="Nota de revisión (opcional)" maxLength={500} value={note} testId="job-review-note" onChange={(e) => setNote(e.target.value)} />
                  <div className="flex gap-2">
                    <Button variant="primary" disabled={review.isPending} onClick={() => review.mutate("approve")} data-testid="job-approve">
                      Aprobar
                    </Button>
                    <Button variant="danger" disabled={review.isPending} onClick={() => review.mutate("reject")} data-testid="job-reject">
                      Rechazar
                    </Button>
                  </div>
                </div>
              ) : null}
              {canCreate && canRetry(j.status, j.attempts) ? (
                <div>
                  <Button disabled={retry.isPending} onClick={() => retry.mutate()} data-testid="job-retry">
                    Reintentar
                  </Button>
                </div>
              ) : null}
              {j.status === "FAILED" && !canRetry(j.status, j.attempts) ? <p className="text-xs text-gray-600">Sin reintentos disponibles: sube de nuevo el archivo corregido.</p> : null}
            </div>
          );
        }}
      </QueryBoundary>
    </Card>
  );
}
