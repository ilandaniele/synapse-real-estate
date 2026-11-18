"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PointOfInterestInput, type PointOfInterest } from "@synapse/contracts";
import { api } from "@/lib/api";
import { keys, usePointsOfInterest } from "@/lib/queries";
import { useCan } from "@/lib/session";
import { POI_CATEGORY_LABELS } from "@/lib/format";
import { apiFieldErrors, parseNumber, zodFieldErrors, type FieldErrors } from "@/lib/forms";
import { ConfirmDelete } from "../content";
import { Button, ErrorBanner, Modal, QueryBoundary, SelectField, TableShell, TD, TextField, TH } from "../ui";
import { EnglishFields, useEnglishText } from "../EnglishFields";

const ENGLISH_FIELDS = [
  { name: "name", label: "Nombre" },
  { name: "distanceText", label: "Distancia" },
];

type Category = PointOfInterest["category"];
const CATEGORIES = Object.keys(POI_CATEGORY_LABELS) as Category[];

type EditTarget = { mode: "create" } | { mode: "edit"; poi: PointOfInterest };

export function LocationTab({ developmentId }: { developmentId: string }) {
  const pois = usePointsOfInterest(developmentId);
  const canWrite = useCan("development:write");
  const [target, setTarget] = useState<EditTarget | null>(null);

  const createButton = canWrite ? (
    <Button variant="primary" onClick={() => setTarget({ mode: "create" })} data-testid="poi-create-open">
      Nuevo punto
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">Puntos de interés que se muestran en el mapa de ubicación.</p>
        {createButton}
      </div>
      <QueryBoundary
        query={pois}
        isEmpty={(items) => items.length === 0}
        emptyTitle="No hay puntos de interés"
        emptyDescription={canWrite ? "Añade playas, colegios o servicios cercanos." : undefined}
        emptyAction={createButton}
      >
        {(items) => (
          <TableShell caption="Puntos de interés" testId="poi-table">
            <thead>
              <tr>
                <th className={TH}>Nombre</th>
                <th className={TH}>Categoría</th>
                <th className={TH}>Latitud</th>
                <th className={TH}>Longitud</th>
                <th className={TH}>Distancia</th>
                <th className={TH}>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((poi) => (
                <tr key={poi.id} data-testid="poi-row">
                  <td className={TD}>{poi.name}</td>
                  <td className={TD}>{POI_CATEGORY_LABELS[poi.category]}</td>
                  <td className={TD}>{poi.lat}</td>
                  <td className={TD}>{poi.lng}</td>
                  <td className={TD}>{poi.distanceText ?? "—"}</td>
                  <td className={TD}>
                    {canWrite ? (
                      <Button onClick={() => setTarget({ mode: "edit", poi })} aria-label={`Editar ${poi.name}`} data-testid="poi-edit">
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
      {target ? <PoiDialog key={target.mode === "edit" ? target.poi.id : "new"} developmentId={developmentId} target={target} onClose={() => setTarget(null)} /> : null}
    </div>
  );
}

function PoiDialog({ developmentId, target, onClose }: { developmentId: string; target: EditTarget; onClose: () => void }) {
  const queryClient = useQueryClient();
  const poi = target.mode === "edit" ? target.poi : null;
  const [name, setName] = useState(poi?.name ?? "");
  const [category, setCategory] = useState<Category>(poi?.category ?? "BEACH");
  const [lat, setLat] = useState(String(poi?.lat ?? ""));
  const [lng, setLng] = useState(String(poi?.lng ?? ""));
  const [distanceText, setDistanceText] = useState(poi?.distanceText ?? "");
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const english = useEnglishText(poi?.translations);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: keys.pointsOfInterest(developmentId) });

  const save = useMutation({
    mutationFn: (input: PointOfInterestInput) =>
      poi
        ? api<PointOfInterest>(`/admin/points-of-interest/${poi.id}`, { method: "PATCH", body: input })
        : api<PointOfInterest>(`/admin/developments/${developmentId}/points-of-interest`, { method: "POST", body: input }),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = PointOfInterestInput.safeParse({
      name: name.trim(),
      category,
      lat: parseNumber(lat),
      lng: parseNumber(lng),
      distanceText: distanceText.trim() || null,
      translations: english.translations,
    });
    const errors: FieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error);
    for (const [field, raw] of Object.entries({ lat, lng })) {
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
    <Modal title={poi ? poi.name : "Nuevo punto de interés"} onClose={onClose} testId="poi-dialog">
      <form onSubmit={submit} noValidate className="grid gap-3 md:grid-cols-2" data-testid="poi-form">
        <TextField label="Nombre" className="md:col-span-2" value={name} error={errors.name} testId="poi-field-name" onChange={(e) => setName(e.target.value)} />
        <SelectField label="Categoría" value={category} error={errors.category} testId="poi-field-category" onChange={(e) => setCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {POI_CATEGORY_LABELS[c]}
            </option>
          ))}
        </SelectField>
        <TextField label="Distancia" value={distanceText} error={errors.distanceText} hint="Opcional, p. ej. 5 min en coche" testId="poi-field-distance" onChange={(e) => setDistanceText(e.target.value)} />
        <TextField label="Latitud" inputMode="decimal" value={lat} error={errors.lat} hint="Entre -90 y 90" testId="poi-field-lat" onChange={(e) => setLat(e.target.value)} />
        <TextField label="Longitud" inputMode="decimal" value={lng} error={errors.lng} hint="Entre -180 y 180" testId="poi-field-lng" onChange={(e) => setLng(e.target.value)} />
        <EnglishFields fields={ENGLISH_FIELDS} {...english} errors={errors} testId="poi-field-en" />
        <div className="flex flex-col gap-2 md:col-span-2">
          <ErrorBanner error={save.error} testId="poi-form-error" />
          <div>
            <Button type="submit" variant="primary" disabled={save.isPending} data-testid="poi-save">
              {save.isPending ? "Guardando…" : poi ? "Guardar cambios" : "Crear punto"}
            </Button>
          </div>
        </div>
      </form>
      {poi ? (
        <ConfirmDelete
          subject={`el punto «${poi.name}»`}
          buttonLabel="Borrar punto"
          testId="poi-delete"
          remove={() => api<void>(`/admin/points-of-interest/${poi.id}`, { method: "DELETE" })}
          onDeleted={() => {
            refresh();
            onClose();
          }}
        />
      ) : null}
    </Modal>
  );
}
