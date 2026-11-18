"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Development } from "@synapse/contracts";
import { api } from "@/lib/api";
import { keys } from "@/lib/queries";
import { useCan } from "@/lib/session";
import { DevelopmentForm, type DevelopmentFormValues } from "../DevelopmentForm";
import { Card } from "../ui";

export function DatosTab({ development }: { development: Development }) {
  const queryClient = useQueryClient();
  const canWrite = useCan("development:write");

  const save = useMutation({
    mutationFn: (input: DevelopmentFormValues) => api<Development>(`/admin/developments/${development.id}`, { method: "PATCH", body: input }),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.development(development.id), updated);
      void queryClient.invalidateQueries({ queryKey: keys.developments });
    },
  });

  return (
    <Card title="Datos del desarrollo">
      <DevelopmentForm
        initial={{
          name: development.name,
          slug: development.slug,
          tagline: development.tagline,
          description: development.description,
          city: development.city,
          country: development.country,
          lat: development.lat,
          lng: development.lng,
          currency: development.currency,
          translations: development.translations,
        }}
        disabled={!canWrite}
        pending={save.isPending}
        error={save.error}
        submitLabel="Guardar cambios"
        onSubmit={(values) => save.mutate(values)}
      />
      {save.isSuccess ? (
        <p role="status" data-testid="dev-saved" className="mt-3 text-sm text-green-800">
          Cambios guardados.
        </p>
      ) : null}
      {!canWrite ? <p className="mt-3 text-sm text-gray-600">Solo lectura: tu rol no puede editar el desarrollo.</p> : null}
    </Card>
  );
}
