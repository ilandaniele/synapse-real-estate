"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Publication } from "@synapse/contracts";
import { api } from "@/lib/api";
import { keys, usePublications } from "@/lib/queries";
import { useCan } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { Button, Card, ErrorBanner, QueryBoundary, TableShell, TD, TH } from "../ui";

export function PublishTab({ developmentId }: { developmentId: string }) {
  const queryClient = useQueryClient();
  const canPublish = useCan("development:publish");
  const publications = usePublications(developmentId);

  const publish = useMutation({
    mutationFn: () => api<Publication>(`/admin/developments/${developmentId}/publish`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.publications(developmentId) });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
    },
  });

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
          {(items) => (
            <TableShell caption="Publicaciones" testId="publications-table">
              <thead>
                <tr>
                  <th className={TH}>Versión</th>
                  <th className={TH}>Fecha</th>
                  <th className={TH}>Publicado por</th>
                </tr>
              </thead>
              <tbody>
                {[...items]
                  .sort((a, b) => b.version - a.version)
                  .map((p) => (
                    <tr key={p.id} data-testid={`publication-row-${p.version}`}>
                      <td className={TD}>v{p.version}</td>
                      <td className={TD}>{formatDateTime(p.publishedAt)}</td>
                      <td className={TD}>{p.publishedBy}</td>
                    </tr>
                  ))}
              </tbody>
            </TableShell>
          )}
        </QueryBoundary>
      </Card>
    </div>
  );
}
