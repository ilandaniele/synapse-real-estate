"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Publication } from "@synapse/contracts";
import { api } from "@/lib/api";
import { keys, usePublications } from "@/lib/queries";
import { useCan } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { Button, Card, ErrorBanner, Modal, QueryBoundary, TableShell, TD, TH } from "../ui";
import { PublicationDiffView } from "./PublicationDiffView";

type Dialog = { kind: "diff" | "restore"; version: number; latest: number };

export function PublishTab({ developmentId }: { developmentId: string }) {
  const queryClient = useQueryClient();
  const canPublish = useCan("development:publish");
  const publications = usePublications(developmentId);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const refreshHistory = () => {
    void queryClient.invalidateQueries({ queryKey: keys.publications(developmentId) });
    void queryClient.invalidateQueries({ queryKey: keys.dashboard });
  };
  const publish = useMutation({
    mutationFn: () => api<Publication>(`/admin/developments/${developmentId}/publish`, { method: "POST" }),
    onSuccess: refreshHistory,
  });
  const restore = useMutation({
    mutationFn: (version: number) => api<Publication>(`/admin/developments/${developmentId}/publications/${version}/restore`, { method: "POST" }),
    onSuccess: () => {
      refreshHistory();
      setDialog(null);
    },
  });
  const closeDialog = () => {
    restore.reset();
    setDialog(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card title="Publicar en el showroom">
        <p className="mb-3 text-sm text-gray-600">
          Genera un manifiesto versionado con las unidades visibles (las «No publicadas» se excluyen), escenas, planos y galería, y lo valida antes de guardarlo. El showroom público
          sirve siempre la última versión.
        </p>
        <div className="flex flex-col gap-3">
          <div>
            <Button variant="primary" disabled={!canPublish || publish.isPending} onClick={() => publish.mutate()} data-testid="publish-button">
              {publish.isPending ? "Publicando…" : "Publicar ahora"}
            </Button>
            {!canPublish ? <span className="ml-3 text-sm text-gray-600">Tu rol no puede publicar.</span> : null}
          </div>
          {publish.isSuccess ? (
            <p role="status" data-testid="publish-result" className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900">
              Publicada la versión <strong data-testid="publish-version">{publish.data.version}</strong> el {formatDateTime(publish.data.publishedAt)}.
            </p>
          ) : null}
          {publish.isError ? (
            <div data-testid="publish-error">
              <ErrorBanner error={publish.error} testId="publish-error-banner" />
            </div>
          ) : null}
        </div>
      </Card>
      <Card title="Historial de publicaciones">
        <QueryBoundary query={publications} isEmpty={(items) => items.length === 0} emptyTitle="Todavía no se ha publicado este desarrollo">
          {(items) => {
            const latest = Math.max(...items.map((p) => p.version));
            return (
              <TableShell caption="Publicaciones" testId="publications-table">
                <thead>
                  <tr>
                    <th className={TH}>Versión</th>
                    <th className={TH}>Fecha</th>
                    <th className={TH}>Publicado por</th>
                    <th className={TH}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {[...items]
                    .sort((a, b) => b.version - a.version)
                    .map((p) => (
                      <tr key={p.id} data-testid={`publication-row-${p.version}`}>
                        <td className={TD}>
                          v{p.version}
                          {p.restoredFromVersion ? <span className="ml-2 text-xs text-gray-600">(restaurada de v{p.restoredFromVersion})</span> : null}
                        </td>
                        <td className={TD}>{formatDateTime(p.publishedAt)}</td>
                        <td className={TD}>{p.publishedBy}</td>
                        <td className={TD}>
                          <div className="flex gap-2">
                            {p.version > 1 ? (
                              <Button variant="ghost" onClick={() => setDialog({ kind: "diff", version: p.version, latest })} data-testid={`publication-diff-${p.version}`}>
                                Ver cambios
                              </Button>
                            ) : null}
                            {canPublish && p.version !== latest ? (
                              <Button onClick={() => setDialog({ kind: "restore", version: p.version, latest })} data-testid={`publication-restore-${p.version}`}>
                                Restaurar
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </TableShell>
            );
          }}
        </QueryBoundary>
      </Card>
      {dialog?.kind === "diff" ? (
        <Modal title={`Cambios de v${dialog.version - 1} a v${dialog.version}`} onClose={closeDialog} testId="publication-diff-modal" wide>
          <PublicationDiffView developmentId={developmentId} from={dialog.version - 1} to={dialog.version} />
        </Modal>
      ) : null}
      {dialog?.kind === "restore" ? (
        <Modal title={`Restaurar la versión ${dialog.version}`} onClose={closeDialog} testId="publication-restore-modal" wide>
          <p className="mb-3 text-sm text-gray-600">
            Se publicará una versión nueva con el contenido de v{dialog.version}. El estado comercial y el precio de cada unidad se mantienen como están hoy, y las unidades que ya no
            son públicas no vuelven a aparecer. Cambios respecto de la versión publicada (v{dialog.latest}):
          </p>
          <PublicationDiffView developmentId={developmentId} from={dialog.latest} to={dialog.version} />
          {restore.isError ? <ErrorBanner error={restore.error} testId="restore-error" /> : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={closeDialog}>Cancelar</Button>
            <Button variant="primary" disabled={restore.isPending} onClick={() => restore.mutate(dialog.version)} data-testid="publication-restore-confirm">
              {restore.isPending ? "Restaurando…" : `Restaurar v${dialog.version}`}
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
