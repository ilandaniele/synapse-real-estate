"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { WebhookEndpointInput, type WebhookEndpoint, type WebhookEndpointCreated } from "@synapse/contracts";
import { EmptyState } from "@synapse/ui";
import { api } from "@/lib/api";
import { keys, useWebhookDeliveries, useWebhooks } from "@/lib/queries";
import { useCan } from "@/lib/session";
import { formatDateTime, WEBHOOK_STATUS_LABELS } from "@/lib/format";
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from "@/lib/forms";
import { ConfirmDelete } from "@/components/content";
import { Button, ErrorBanner, Modal, PageHeader, QueryBoundary, TableShell, TD, TextField, TH } from "@/components/ui";

export default function IntegrationsPage() {
  if (!useCan("integration:manage")) {
    return <EmptyState title="Sin permiso" description="Solo los propietarios pueden gestionar integraciones." />;
  }
  return <IntegrationsView />;
}

function IntegrationsView() {
  const webhooks = useWebhooks();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "manage"; endpoint: WebhookEndpoint } | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: keys.webhooks });

  return (
    <>
      <PageHeader
        title="Integraciones"
        description="Webhooks que reciben cada lead nuevo firmado con HMAC-SHA256, para conectar tu CRM."
        actions={
          <Button variant="primary" onClick={() => setDialog({ mode: "create" })} data-testid="webhook-create-open">
            Nuevo webhook
          </Button>
        }
      />
      <QueryBoundary query={webhooks} isEmpty={(items) => items.length === 0} emptyTitle="No hay webhooks">
        {(items) => (
          <TableShell caption="Webhooks" testId="webhook-table">
            <thead>
              <tr>
                <th className={TH}>URL</th>
                <th className={TH}>Descripción</th>
                <th className={TH}>Alta</th>
                <th className={TH}>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((endpoint) => (
                <tr key={endpoint.id} data-testid="webhook-row">
                  <td className={`${TD} break-all`}>{endpoint.url}</td>
                  <td className={TD}>{endpoint.description ?? "—"}</td>
                  <td className={TD}>{formatDateTime(endpoint.createdAt)}</td>
                  <td className={TD}>
                    <Button onClick={() => setDialog({ mode: "manage", endpoint })} aria-label={`Ver entregas de ${endpoint.url}`} data-testid="webhook-manage">
                      Entregas
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </QueryBoundary>
      {dialog?.mode === "create" ? <CreateWebhookDialog onClose={() => setDialog(null)} onCreated={refresh} /> : null}
      {dialog?.mode === "manage" ? <ManageWebhookDialog endpoint={dialog.endpoint} onClose={() => setDialog(null)} onDeleted={refresh} /> : null}
    </>
  );
}

function CreateWebhookDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const create = useMutation({
    mutationFn: (input: WebhookEndpointInput) => api<WebhookEndpointCreated>("/admin/webhooks", { method: "POST", body: input }),
    onSuccess: onCreated,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = WebhookEndpointInput.safeParse({ url, description: description || undefined });
    if (!parsed.success) {
      setClientErrors(zodFieldErrors(parsed.error));
      return;
    }
    setClientErrors({});
    create.mutate(parsed.data);
  };

  if (create.data) {
    return (
      <Modal title="Webhook creado" onClose={onClose} testId="webhook-dialog">
        <p className="text-sm text-gray-700">Copia el secreto ahora: no se volverá a mostrar. Úsalo para verificar la cabecera X-Synapse-Signature.</p>
        <code className="mt-3 block break-all rounded-md bg-gray-100 p-3 text-sm" data-testid="webhook-secret">
          {create.data.secret}
        </code>
        <div className="mt-4">
          <Button variant="primary" onClick={onClose} data-testid="webhook-secret-done">
            Hecho
          </Button>
        </div>
      </Modal>
    );
  }

  const errors = { ...apiFieldErrors(create.error), ...clientErrors };
  return (
    <Modal title="Nuevo webhook" onClose={onClose} testId="webhook-dialog">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3" data-testid="webhook-form">
        <TextField
          label="URL"
          type="url"
          value={url}
          error={errors.url}
          hint="En producción debe ser https y pública."
          testId="webhook-field-url"
          onChange={(e) => setUrl(e.target.value)}
        />
        <TextField label="Descripción" value={description} error={errors.description} testId="webhook-field-description" onChange={(e) => setDescription(e.target.value)} />
        <ErrorBanner error={create.error} testId="webhook-form-error" />
        <div>
          <Button type="submit" variant="primary" disabled={create.isPending} data-testid="webhook-save">
            {create.isPending ? "Creando…" : "Crear webhook"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ManageWebhookDialog({ endpoint, onClose, onDeleted }: { endpoint: WebhookEndpoint; onClose: () => void; onDeleted: () => void }) {
  const deliveries = useWebhookDeliveries(endpoint.id);
  return (
    <Modal title={endpoint.url} onClose={onClose} testId="webhook-manage-dialog">
      <QueryBoundary query={deliveries} isEmpty={(items) => items.length === 0} emptyTitle="Todavía no hay entregas">
        {(items) => (
          <TableShell caption="Últimas entregas" testId="webhook-deliveries">
            <thead>
              <tr>
                <th className={TH}>Evento</th>
                <th className={TH}>Estado</th>
                <th className={TH}>Intentos</th>
                <th className={TH}>Respuesta</th>
                <th className={TH}>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {items.map((delivery) => (
                <tr key={delivery.id} data-testid="webhook-delivery-row">
                  <td className={TD}>{delivery.event}</td>
                  <td className={TD}>{WEBHOOK_STATUS_LABELS[delivery.status]}</td>
                  <td className={TD}>{delivery.attempts}</td>
                  <td className={TD}>{delivery.lastError ?? delivery.responseStatus ?? "—"}</td>
                  <td className={TD}>{formatDateTime(delivery.deliveredAt ?? delivery.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </QueryBoundary>
      <ConfirmDelete
        subject={`el webhook ${endpoint.url} y su historial de entregas`}
        buttonLabel="Eliminar webhook"
        testId="webhook-delete"
        remove={() => api<void>(`/admin/webhooks/${endpoint.id}`, { method: "DELETE" })}
        onDeleted={() => {
          onDeleted();
          onClose();
        }}
      />
    </Modal>
  );
}
