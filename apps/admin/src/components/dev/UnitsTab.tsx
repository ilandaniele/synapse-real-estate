"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UnitInput, type Unit } from "@synapse/contracts";
import { canTransition, STATUS_META, UNIT_STATUSES, type UnitStatus } from "@synapse/domain";
import { Price, StatusBadge } from "@synapse/ui";
import { api } from "@/lib/api";
import { keys, useUnits } from "@/lib/queries";
import { useCan } from "@/lib/session";
import { apiFieldErrors, parseNumber, zodFieldErrors, type FieldErrors } from "@/lib/forms";
import { ConfirmDelete } from "../content";
import { Button, ErrorBanner, Modal, QueryBoundary, SelectField, TableShell, TD, TextAreaField, TextField, TH } from "../ui";

type EditTarget = { mode: "create" } | { mode: "edit"; unit: Unit };

export function UnitsTab({ developmentId, currency }: { developmentId: string; currency: string }) {
  const units = useUnits(developmentId);
  const canWrite = useCan("unit:write");
  const canAvailability = useCan("unit:availability");
  const [target, setTarget] = useState<EditTarget | null>(null);

  const createButton = canWrite ? (
    <Button variant="primary" onClick={() => setTarget({ mode: "create" })} data-testid="unit-create-open">
      Nueva unidad
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">Estado comercial, precios y mallas del masterplan de cada unidad.</p>
        {createButton}
      </div>
      <QueryBoundary
        query={units}
        isEmpty={(items) => items.length === 0}
        emptyTitle="Este desarrollo no tiene unidades"
        emptyDescription={canWrite ? "Crea la primera unidad para poder publicarla." : undefined}
        emptyAction={createButton}
      >
        {(items) => (
          <TableShell caption="Unidades" testId="units-table">
            <thead>
              <tr>
                <th className={TH}>Código</th>
                <th className={TH}>Nombre</th>
                <th className={TH}>Estado</th>
                <th className={TH}>Precio</th>
                <th className={TH}>Dorm.</th>
                <th className={TH}>Baños</th>
                <th className={TH}>Interior</th>
                <th className={TH}>Mallas</th>
                <th className={TH}>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((unit) => (
                <tr key={unit.id} data-testid={`unit-row-${unit.code}`} data-status={unit.status}>
                  <td className={TD}>
                    <strong>{unit.code}</strong>
                  </td>
                  <td className={TD}>{unit.name}</td>
                  <td className={TD}>
                    <StatusBadge status={unit.status} />
                  </td>
                  <td className={TD}>
                    <Price amount={unit.price} currency={unit.currency} />
                  </td>
                  <td className={TD}>{unit.bedrooms}</td>
                  <td className={TD}>{unit.bathrooms}</td>
                  <td className={TD}>{unit.interiorArea} m²</td>
                  <td className={TD}>
                    <code className="text-xs">{unit.meshNames.join(", ") || "—"}</code>
                  </td>
                  <td className={TD}>
                    <Button onClick={() => setTarget({ mode: "edit", unit })} data-testid={`unit-edit-${unit.code}`} aria-label={`${canWrite || canAvailability ? "Editar" : "Ver"} ${unit.code}`}>
                      {canWrite || canAvailability ? "Editar" : "Ver"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </QueryBoundary>
      {target ? (
        <UnitDialog
          key={target.mode === "edit" ? target.unit.id : "new"}
          developmentId={developmentId}
          currency={currency}
          target={target}
          canWrite={canWrite}
          canAvailability={canAvailability}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </div>
  );
}

function UnitDialog({
  developmentId,
  currency,
  target,
  canWrite,
  canAvailability,
  onClose,
}: {
  developmentId: string;
  currency: string;
  target: EditTarget;
  canWrite: boolean;
  canAvailability: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const unit = target.mode === "edit" ? target.unit : null;
  const readOnly = unit ? !canWrite : false;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.units(developmentId) });
    void queryClient.invalidateQueries({ queryKey: keys.dashboard });
  };

  const [code, setCode] = useState(unit?.code ?? "");
  const [name, setName] = useState(unit?.name ?? "");
  const [slug, setSlug] = useState(unit?.slug ?? "");
  const [status, setStatus] = useState<UnitStatus>("AVAILABLE");
  const [price, setPrice] = useState(unit?.price ?? "");
  const [unitCurrency, setUnitCurrency] = useState(unit?.currency ?? currency);
  const [interiorArea, setInteriorArea] = useState(String(unit?.interiorArea ?? ""));
  const [plotArea, setPlotArea] = useState(String(unit?.plotArea ?? ""));
  const [terraceArea, setTerraceArea] = useState(String(unit?.terraceArea ?? 0));
  const [bedrooms, setBedrooms] = useState(String(unit?.bedrooms ?? ""));
  const [bathrooms, setBathrooms] = useState(String(unit?.bathrooms ?? ""));
  const [floors, setFloors] = useState(String(unit?.floors ?? 1));
  const [unitType, setUnitType] = useState(unit?.unitType ?? "Villa");
  const [sector, setSector] = useState(unit?.sector ?? "");
  const [orientation, setOrientation] = useState(unit?.orientation ?? "");
  const [description, setDescription] = useState(unit?.description ?? "");
  const [meshNames, setMeshNames] = useState(unit?.meshNames.join(", ") ?? "");
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});

  const save = useMutation({
    mutationFn: (input: UnitInput) =>
      unit
        ? api<Unit>(`/admin/units/${unit.id}`, { method: "PATCH", body: withoutStatus(input) })
        : api<Unit>(`/admin/developments/${developmentId}/units`, { method: "POST", body: input }),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = UnitInput.safeParse({
      code: code.trim(),
      name: name.trim(),
      slug: slug.trim() === "" ? undefined : slug.trim(),
      status: unit?.status ?? status,
      price: price.trim(),
      currency: unitCurrency.trim().toUpperCase(),
      interiorArea: parseNumber(interiorArea),
      plotArea: parseNumber(plotArea),
      terraceArea: parseNumber(terraceArea),
      bedrooms: parseNumber(bedrooms),
      bathrooms: parseNumber(bathrooms),
      floors: parseNumber(floors),
      unitType,
      sector,
      orientation: orientation.trim() === "" ? null : orientation.trim(),
      description,
      meshNames: meshNames
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean),
      labelPosition: unit?.labelPosition ?? null,
    });
    const numeric = { interiorArea, plotArea, terraceArea, bedrooms, bathrooms, floors };
    const errors: FieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error);
    for (const [field, raw] of Object.entries(numeric)) {
      if (Number.isNaN(parseNumber(raw))) errors[field] = "Introduce un número.";
    }
    if (!parsed.success || Object.keys(errors).length > 0) {
      setClientErrors(errors);
      return;
    }
    setClientErrors({});
    save.mutate(parsed.data);
  };

  const errors = { ...apiFieldErrors(save.error), ...clientErrors };

  return (
    <Modal title={unit ? `Unidad ${unit.code}` : "Nueva unidad"} onClose={onClose} testId="unit-dialog" wide>
      <form onSubmit={submit} noValidate className="grid gap-3 md:grid-cols-2" data-testid="unit-form">
        <TextField label="Código" value={code} disabled={readOnly} error={errors.code} testId="unit-field-code" onChange={(e) => setCode(e.target.value)} />
        <TextField label="Nombre" value={name} disabled={readOnly} error={errors.name} testId="unit-field-name" onChange={(e) => setName(e.target.value)} />
        <TextField label="Slug" value={slug} disabled={readOnly} error={errors.slug} hint="Opcional; se genera a partir del nombre." testId="unit-field-slug" onChange={(e) => setSlug(e.target.value)} />
        {unit ? null : (
          <SelectField label="Estado inicial" value={status} error={errors.status} testId="unit-field-status" onChange={(e) => setStatus(e.target.value as UnitStatus)}>
            {UNIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </SelectField>
        )}
        <TextField label="Precio" inputMode="decimal" value={price} disabled={readOnly} error={errors.price} hint="Decimal con punto, p. ej. 895000.00" testId="unit-field-price" onChange={(e) => setPrice(e.target.value)} />
        <TextField label="Moneda" maxLength={3} value={unitCurrency} disabled={readOnly} error={errors.currency} testId="unit-field-currency" onChange={(e) => setUnitCurrency(e.target.value)} />
        <TextField label="Superficie interior (m²)" inputMode="decimal" value={interiorArea} disabled={readOnly} error={errors.interiorArea} testId="unit-field-interiorArea" onChange={(e) => setInteriorArea(e.target.value)} />
        <TextField label="Parcela (m²)" inputMode="decimal" value={plotArea} disabled={readOnly} error={errors.plotArea} testId="unit-field-plotArea" onChange={(e) => setPlotArea(e.target.value)} />
        <TextField label="Terraza (m²)" inputMode="decimal" value={terraceArea} disabled={readOnly} error={errors.terraceArea} testId="unit-field-terraceArea" onChange={(e) => setTerraceArea(e.target.value)} />
        <TextField label="Dormitorios" inputMode="numeric" value={bedrooms} disabled={readOnly} error={errors.bedrooms} testId="unit-field-bedrooms" onChange={(e) => setBedrooms(e.target.value)} />
        <TextField label="Baños" inputMode="numeric" value={bathrooms} disabled={readOnly} error={errors.bathrooms} testId="unit-field-bathrooms" onChange={(e) => setBathrooms(e.target.value)} />
        <TextField label="Plantas" inputMode="numeric" value={floors} disabled={readOnly} error={errors.floors} testId="unit-field-floors" onChange={(e) => setFloors(e.target.value)} />
        <TextField label="Tipo" value={unitType} disabled={readOnly} error={errors.unitType} testId="unit-field-unitType" onChange={(e) => setUnitType(e.target.value)} />
        <TextField label="Sector" value={sector} disabled={readOnly} error={errors.sector} testId="unit-field-sector" onChange={(e) => setSector(e.target.value)} />
        <TextField label="Orientación" value={orientation} disabled={readOnly} error={errors.orientation} testId="unit-field-orientation" onChange={(e) => setOrientation(e.target.value)} />
        <TextField label="Mallas del GLB" value={meshNames} disabled={readOnly} error={errors.meshNames} hint="Separadas por coma, p. ej. Villa_06" testId="unit-field-meshNames" onChange={(e) => setMeshNames(e.target.value)} />
        <TextAreaField label="Descripción" className="md:col-span-2" value={description} disabled={readOnly} error={errors.description} testId="unit-field-description" onChange={(e) => setDescription(e.target.value)} />
        <div className="flex flex-col gap-2 md:col-span-2">
          <ErrorBanner error={save.error} testId="unit-form-error" />
          {readOnly ? null : (
            <div>
              <Button type="submit" variant="primary" disabled={save.isPending} data-testid="unit-save">
                {save.isPending ? "Guardando…" : unit ? "Guardar cambios" : "Crear unidad"}
              </Button>
            </div>
          )}
        </div>
      </form>
      {unit ? (
        <>
          <StatusSection unit={unit} canAvailability={canAvailability} onChanged={refresh} />
          {canWrite ? (
            <ConfirmDelete
              subject={`la unidad ${unit.code}`}
              buttonLabel="Borrar unidad"
              testId="unit-delete"
              remove={() => api<void>(`/admin/units/${unit.id}`, { method: "DELETE" })}
              onDeleted={() => {
                refresh();
                onClose();
              }}
            />
          ) : null}
        </>
      ) : null}
    </Modal>
  );
}

function withoutStatus(input: UnitInput): Omit<UnitInput, "status"> {
  const { status: _status, ...rest } = input;
  return rest;
}

function StatusSection({ unit, canAvailability, onChanged }: { unit: Unit; canAvailability: boolean; onChanged: () => void }) {
  const [status, setStatus] = useState<UnitStatus>(unit.status);
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState<UnitStatus | null>(null);
  const current = saved ?? unit.status;
  const allowed = UNIT_STATUSES.filter((s) => canTransition(current, s));

  const change = useMutation({
    mutationFn: () =>
      api<Unit>(`/admin/units/${unit.id}/availability`, {
        method: "PATCH",
        body: { status, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      }),
    onSuccess: () => {
      setSaved(status);
      onChanged();
    },
  });

  return (
    <fieldset className="mt-5 rounded-md border border-gray-200 p-3" data-testid="unit-status-section">
      <legend className="px-1 text-sm font-semibold">Estado comercial</legend>
      <p className="mb-2 flex items-center gap-2 text-sm">
        Estado actual: <StatusBadge status={current} />
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField
          label="Nuevo estado"
          value={status}
          disabled={!canAvailability}
          testId="unit-status-select"
          hint="Solo se muestran las transiciones permitidas."
          onChange={(e) => setStatus(e.target.value as UnitStatus)}
        >
          {allowed.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
              {s === current ? " (actual)" : ""}
            </option>
          ))}
        </SelectField>
        <TextField label="Motivo (opcional)" maxLength={300} value={reason} disabled={!canAvailability} testId="unit-status-reason" onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <ErrorBanner error={change.error} testId="unit-status-error" />
        {change.isSuccess ? (
          <p role="status" data-testid="unit-status-ok" className="text-sm text-green-800">
            Estado actualizado a {STATUS_META[saved ?? status].label}.
          </p>
        ) : null}
        <div>
          <Button variant="primary" disabled={!canAvailability || change.isPending || status === current} onClick={() => change.mutate()} data-testid="unit-status-save">
            {change.isPending ? "Guardando…" : "Cambiar estado"}
          </Button>
        </div>
      </div>
    </fieldset>
  );
}
