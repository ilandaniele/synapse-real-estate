"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import type { Asset, Job, UploadTicket } from "@synapse/contracts";
import { api } from "@/lib/api";
import { keys, useAssets, useDevelopments } from "@/lib/queries";
import { useCan } from "@/lib/session";
import { ASSET_STATUS_LABELS, formatBytes, formatDateTime } from "@/lib/format";
import { ACCEPTED_EXTENSIONS, contentTypeFor, putWithProgress, validateFileForUpload } from "@/lib/upload";
import { Button, Card, ErrorBanner, PageHeader, QueryBoundary, SelectField, TableShell, TD, TH } from "@/components/ui";

type UploadTicketData = z.infer<typeof UploadTicket>;

export default function AssetsPage() {
  const queryClient = useQueryClient();
  const canUpload = useCan("asset:upload");
  const canProcess = useCan("job:create");
  const assets = useAssets();
  const developments = useDevelopments();
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [processDevelopmentId, setProcessDevelopmentId] = useState("");

  const upload = useMutation({
    mutationFn: async (selected: File) => {
      const check = validateFileForUpload(selected);
      if (!check.ok || !check.kind) throw new Error(check.message ?? "Archivo no válido");
      setProgress(0);
      const ticket = await api<UploadTicketData>("/admin/assets/uploads", {
        method: "POST",
        body: { filename: selected.name, size: selected.size, contentType: contentTypeFor(selected, check.kind) },
      });
      await putWithProgress(ticket.uploadUrl, selected, contentTypeFor(selected, check.kind), setProgress);
      return selected.name;
    },
    onSuccess: (name) => {
      setUploaded(name);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    },
    onSettled: () => {
      setProgress(null);
      // A rejected upload still leaves an asset row (status REJECTED) worth showing.
      void queryClient.invalidateQueries({ queryKey: keys.assets });
    },
  });

  const process = useMutation({
    mutationFn: (asset: Asset) =>
      api<Job>("/admin/jobs", { method: "POST", body: { kind: "IMPORT", assetId: asset.id, ...(processDevelopmentId ? { developmentId: processDevelopmentId } : {}) } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.jobs }),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setUploaded(null);
    upload.reset();
    if (!file) {
      setValidationError("Elige un archivo.");
      return;
    }
    const check = validateFileForUpload(file);
    if (!check.ok) {
      setValidationError(check.message ?? "Archivo no válido");
      return;
    }
    setValidationError(null);
    upload.mutate(file);
  };

  return (
    <>
      <PageHeader title="Activos" description="Modelos GLB/glTF y panoramas equirrectangulares del showroom." />
      <div role="note" data-testid="asset-notice" className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        DWG, IFC, FBX y OBJ no se convierten automáticamente: exporte a GLB/glTF o panorama equirectangular 2:1. Los DXF solo se inspeccionan como referencia y no se generan renders fotorrealistas
        automáticos; todo resultado pasa por revisión manual.
      </div>
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <Card title="Subir archivo">
          {canUpload ? (
            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3" data-testid="asset-upload-form">
              <div className="flex flex-col gap-1">
                <label htmlFor="asset-file" className="text-sm font-medium text-gray-800">
                  Archivo
                </label>
                <input
                  id="asset-file"
                  ref={fileInput}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS}
                  data-testid="asset-file-input"
                  className="text-sm"
                  onChange={(e) => {
                    const selected = e.target.files?.[0] ?? null;
                    setFile(selected);
                    setUploaded(null);
                    upload.reset();
                    setValidationError(selected ? (validateFileForUpload(selected).message ?? null) : null);
                  }}
                />
                <span className="text-xs text-gray-500">Formatos: {ACCEPTED_EXTENSIONS.replaceAll(",", " ")}. El límite de tamaño depende del tipo de archivo.</span>
              </div>
              {validationError ? (
                <p role="alert" data-testid="asset-validation-error" className="text-sm text-red-700">
                  {validationError}
                </p>
              ) : null}
              {progress !== null ? (
                <div>
                  <progress value={progress} max={1} aria-label="Progreso de subida" data-testid="asset-progress" className="w-full" />
                  <span className="text-xs text-gray-600">{Math.round(progress * 100)} %</span>
                </div>
              ) : null}
              <ErrorBanner error={upload.error} testId="asset-upload-error" />
              {uploaded ? (
                <p role="status" data-testid="asset-upload-ok" className="text-sm text-green-800">
                  «{uploaded}» subido correctamente. Ya puedes procesarlo.
                </p>
              ) : null}
              <div>
                <Button type="submit" variant="primary" disabled={upload.isPending} data-testid="asset-upload-submit">
                  {upload.isPending ? "Subiendo…" : "Subir"}
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-gray-600">Tu rol no puede subir archivos.</p>
          )}
        </Card>
        <Card title="Archivos">
          {canProcess ? (
            <SelectField
              label="Desarrollo para el mapeo de mallas (GLB)"
              value={processDevelopmentId}
              testId="asset-process-dev"
              hint="Opcional. Con un desarrollo, el proceso sugiere qué malla Villa_NN corresponde a cada unidad."
              onChange={(e) => setProcessDevelopmentId(e.target.value)}
              className="mb-3 max-w-md"
            >
              <option value="">Sin desarrollo</option>
              {(developments.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </SelectField>
          ) : null}
          <ErrorBanner error={process.error} testId="asset-process-error" />
          {process.isSuccess ? (
            <p role="status" data-testid="asset-process-ok" className="mb-2 text-sm text-green-800">
              Proceso de importación creado.{" "}
              <Link href="/jobs" className="underline">
                Ver procesos
              </Link>
            </p>
          ) : null}
          <QueryBoundary query={assets} isEmpty={(items) => items.length === 0} emptyTitle="Todavía no hay archivos" emptyDescription="Sube un GLB o un panorama para empezar.">
            {(items) => (
              <TableShell caption="Archivos subidos" testId="assets-table">
                <thead>
                  <tr>
                    <th className={TH}>Archivo</th>
                    <th className={TH}>Tipo</th>
                    <th className={TH}>Tamaño</th>
                    <th className={TH}>Estado</th>
                    <th className={TH}>Fecha</th>
                    <th className={TH}>
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((asset, i) => (
                    <tr key={asset.id} data-testid={`asset-row-${i}`} data-status={asset.status}>
                      <td className={TD}>{asset.filename}</td>
                      <td className={TD}>{asset.kind ?? "—"}</td>
                      <td className={TD}>{formatBytes(asset.size)}</td>
                      <td className={TD}>
                        <span className={asset.status === "REJECTED" ? "font-medium text-red-700" : ""}>{ASSET_STATUS_LABELS[asset.status]}</span>
                        {asset.rejectionReason ? <div className="text-xs text-red-700">{asset.rejectionReason}</div> : null}
                      </td>
                      <td className={TD}>{formatDateTime(asset.createdAt)}</td>
                      <td className={TD}>
                        {canProcess && asset.status === "UPLOADED" ? (
                          <Button onClick={() => process.mutate(asset)} disabled={process.isPending} data-testid={`asset-process-${i}`} aria-label={`Procesar ${asset.filename}`}>
                            Procesar
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </QueryBoundary>
        </Card>
      </div>
    </>
  );
}
