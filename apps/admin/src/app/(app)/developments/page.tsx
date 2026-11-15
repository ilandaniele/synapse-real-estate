"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Development } from "@synapse/contracts";
import { api } from "@/lib/api";
import { keys, useDevelopments } from "@/lib/queries";
import { useCan } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { DevelopmentForm, type DevelopmentFormValues } from "@/components/DevelopmentForm";
import { Button, Modal, PageHeader, QueryBoundary, TableShell, TD, TH } from "@/components/ui";

export default function DevelopmentsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canWrite = useCan("development:write");
  const developments = useDevelopments();
  const [creating, setCreating] = useState(false);

  const create = useMutation({
    mutationFn: (input: DevelopmentFormValues) => api<Development>("/admin/developments", { method: "POST", body: input }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: keys.developments });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
      router.push(`/developments/${created.id}`);
    },
  });

  const openCreate = () => {
    create.reset();
    setCreating(true);
  };

  const createButton = canWrite ? (
    <Button variant="primary" onClick={openCreate} data-testid="dev-create-open">
      Nuevo desarrollo
    </Button>
  ) : undefined;

  return (
    <>
      <PageHeader title="Desarrollos" description="Promociones de la inmobiliaria con sus unidades, escenas 360 y publicaciones." actions={createButton} />
      <QueryBoundary
        query={developments}
        isEmpty={(items) => items.length === 0}
        emptyTitle="Todavía no hay desarrollos"
        emptyDescription={canWrite ? "Crea el primero para cargar unidades y escenas." : "Pide a un editor que cree el primero."}
        emptyAction={createButton}
      >
        {(items) => (
          <TableShell caption="Desarrollos" testId="developments-table">
            <thead>
              <tr>
                <th className={TH}>Nombre</th>
                <th className={TH}>Slug</th>
                <th className={TH}>Ciudad</th>
                <th className={TH}>Moneda</th>
                <th className={TH}>Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((dev) => (
                <tr key={dev.id} data-testid={`dev-row-${dev.slug}`} onClick={() => router.push(`/developments/${dev.id}`)} className="cursor-pointer hover:bg-gray-50">
                  <td className={TD}>
                    <Link href={`/developments/${dev.id}`} className="font-medium text-blue-700 underline">
                      {dev.name}
                    </Link>
                  </td>
                  <td className={TD}>
                    <code>{dev.slug}</code>
                  </td>
                  <td className={TD}>{dev.city}</td>
                  <td className={TD}>{dev.currency}</td>
                  <td className={TD}>{formatDateTime(dev.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </QueryBoundary>
      {creating ? (
        <Modal title="Nuevo desarrollo" onClose={() => setCreating(false)} testId="dev-create-modal" wide>
          <DevelopmentForm submitLabel="Crear desarrollo" pending={create.isPending} error={create.error} onSubmit={(values) => create.mutate(values)} />
        </Modal>
      ) : null}
    </>
  );
}
