"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FloorPlanInput, type FloorPlan } from "@synapse/contracts";
import { api } from "@/lib/api";
import { keys, useFloorPlans, useUnits } from "@/lib/queries";
import { useCan } from "@/lib/session";
import { readImageSize } from "@/lib/upload";
import { apiFieldErrors, parseNumber, zodFieldErrors, type FieldErrors } from "@/lib/forms";
import { ConfirmDelete, ImageField, UnitSelect, useImageInput } from "../content";
import { Button, ErrorBanner, Modal, QueryBoundary, TableShell, TD, TextField, TH } from "../ui";

type EditTarget = { mode: "create" } | { mode: "edit"; plan: FloorPlan };

export function FloorPlansList({ developmentId }: { developmentId: string }) {
  const plans = useFloorPlans(developmentId);
  const units = useUnits(developmentId);
  const canWrite = useCan("development:write");
  const [target, setTarget] = useState<EditTarget | null>(null);
  const unitCode = (unitId: string | null) => (unitId ? (units.data?.find((u) => u.id === unitId)?.code ?? "—") : "Toda la promoción");

  const createButton = canWrite ? (
    <Button variant="primary" onClick={() => setTarget({ mode: "create" })} data-testid="floorplan-create-open">
      Nuevo plano
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">Planos del mini-mapa «Ir a un punto» del tour.</p>
        {createButton}
      </div>
      <QueryBoundary
        query={plans}
        isEmpty={(items) => items.length === 0}
        emptyTitle="Este desarrollo no tiene planos"
        emptyDescription={canWrite ? "Sube un plano (SVG o imagen) para ubicar las escenas del tour." : undefined}
        emptyAction={createButton}
      >
        {(items) => (
          <TableShell caption="Planos" testId="floorplan-table">
            <thead>
              <tr>
                <th className={TH}>Nombre</th>
                <th className={TH}>Unidad</th>
                <th className={TH}>Tamaño</th>
                <th className={TH}>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((plan) => (
                <tr key={plan.id} data-testid="floorplan-row">
                  <td className={TD}>{plan.name}</td>
                  <td className={TD}>{unitCode(plan.unitId)}</td>
                  <td className={TD}>
                    {plan.width} × {plan.height}
                  </td>
                  <td className={TD}>
                    {canWrite ? (
                      <Button onClick={() => setTarget({ mode: "edit", plan })} aria-label={`Editar ${plan.name}`} data-testid="floorplan-edit">
                        Editar
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </QueryBoundary>
      {target ? <FloorPlanDialog key={target.mode === "edit" ? target.plan.id : "new"} developmentId={developmentId} target={target} onClose={() => setTarget(null)} /> : null}
    </div>
  );
}

function FloorPlanDialog({ developmentId, target, onClose }: { developmentId: string; target: EditTarget; onClose: () => void }) {
  const queryClient = useQueryClient();
  const plan = target.mode === "edit" ? target.plan : null;
  const [name, setName] = useState(plan?.name ?? "");
  const [unitId, setUnitId] = useState<string | null>(plan?.unitId ?? null);
  const [width, setWidth] = useState(String(plan?.width ?? ""));
  const [height, setHeight] = useState(String(plan?.height ?? ""));
  const image = useImageInput({
    required: !plan,
    onSelect: async (file) => {
      const size = await readImageSize(file);
      if (!size) return;
      setWidth(String(size.width));
      setHeight(String(size.height));
    },
  });
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});

  const refresh = () => void queryClient.invalidateQueries({ queryKey: keys.floorPlans(developmentId) });

  const save = useMutation({
    mutationFn: async (input: FloorPlanInput) => {
      const imageAssetId = await image.upload();
      const body = { ...input, ...(imageAssetId ? { imageAssetId } : {}) };
      return plan
        ? api<FloorPlan>(`/admin/floor-plans/${plan.id}`, { method: "PATCH", body })
        : api<FloorPlan>(`/admin/developments/${developmentId}/floor-plans`, { method: "POST", body });
    },
    onSuccess: () => {
      refresh();
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = FloorPlanInput.safeParse({ name: name.trim(), unitId, width: parseNumber(width), height: parseNumber(height) });
    const errors: FieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error);
    const imageError = image.validate();
    if (imageError) errors.image = imageError;
    if (!parsed.success || Object.keys(errors).length > 0) {
      setClientErrors(errors);
      return;
    }
    setClientErrors({});
    save.mutate(parsed.data);
  };

  const errors = { ...apiFieldErrors(save.error), ...clientErrors };

  return (
    <Modal title={plan ? `Plano «${plan.name}»` : "Nuevo plano"} onClose={onClose} testId="floorplan-dialog">
      <form onSubmit={submit} noValidate className="grid gap-3 md:grid-cols-2" data-testid="floorplan-form">
        <TextField label="Nombre" className="md:col-span-2" value={name} error={errors.name} testId="floorplan-field-name" onChange={(e) => setName(e.target.value)} />
        <div className="md:col-span-2">
          <UnitSelect developmentId={developmentId} value={unitId} error={errors.unitId} testId="floorplan-field-unit" onChange={setUnitId} />
        </div>
        <TextField label="Ancho" inputMode="decimal" value={width} error={errors.width} hint="Unidades del plano (px del SVG)" testId="floorplan-field-width" onChange={(e) => setWidth(e.target.value)} />
        <TextField label="Alto" inputMode="decimal" value={height} error={errors.height} testId="floorplan-field-height" onChange={(e) => setHeight(e.target.value)} />
        <div className="md:col-span-2">
          <ImageField label="Imagen del plano" currentUrl={plan?.imageUrl} error={errors.image} testId="floorplan-field-image" {...image.fieldProps} />
        </div>
        <div className="flex flex-col gap-2 md:col-span-2">
          <ErrorBanner error={save.error} testId="floorplan-form-error" />
          <div>
            <Button type="submit" variant="primary" disabled={save.isPending} data-testid="floorplan-save">
              {save.isPending ? "Guardando…" : plan ? "Guardar cambios" : "Crear plano"}
            </Button>
          </div>
        </div>
      </form>
      {plan ? (
        <ConfirmDelete
          subject={`el plano «${plan.name}»`}
          buttonLabel="Borrar plano"
          testId="floorplan-delete"
          remove={() => api<void>(`/admin/floor-plans/${plan.id}`, { method: "DELETE" })}
          onDeleted={() => {
            refresh();
            onClose();
          }}
        />
      ) : null}
    </Modal>
  );
}
