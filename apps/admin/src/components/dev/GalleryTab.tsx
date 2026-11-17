"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GalleryItemInput, type GalleryItem } from "@synapse/contracts";
import { api } from "@/lib/api";
import { keys, useGallery, useUnits } from "@/lib/queries";
import { useCan } from "@/lib/session";
import { apiFieldErrors, parseNumber, zodFieldErrors, type FieldErrors } from "@/lib/forms";
import { ConfirmDelete, ImageField, UnitSelect, useImageInput } from "../content";
import { Button, ErrorBanner, Modal, QueryBoundary, TableShell, TD, TextField, TH } from "../ui";

type EditTarget = { mode: "create" } | { mode: "edit"; item: GalleryItem };

export function GalleryTab({ developmentId }: { developmentId: string }) {
  const gallery = useGallery(developmentId);
  const units = useUnits(developmentId);
  const canWrite = useCan("development:write");
  const [target, setTarget] = useState<EditTarget | null>(null);
  const unitCode = (unitId: string | null) => (unitId ? (units.data?.find((u) => u.id === unitId)?.code ?? "—") : "Toda la promoción");

  const createButton = canWrite ? (
    <Button variant="primary" onClick={() => setTarget({ mode: "create" })} data-testid="gallery-create-open">
      Nueva imagen
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">Imágenes de la galería pública, de la promoción o de una unidad.</p>
        {createButton}
      </div>
      <QueryBoundary
        query={gallery}
        isEmpty={(items) => items.length === 0}
        emptyTitle="La galería está vacía"
        emptyDescription={canWrite ? "Sube la primera imagen." : undefined}
        emptyAction={createButton}
      >
        {(items) => (
          <TableShell caption="Galería" testId="gallery-table">
            <thead>
              <tr>
                <th className={TH}>Imagen</th>
                <th className={TH}>Título</th>
                <th className={TH}>Unidad</th>
                <th className={TH}>Crédito</th>
                <th className={TH}>Orden</th>
                <th className={TH}>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} data-testid="gallery-row">
                  <td className={TD}>
                    <img src={item.imageUrl} alt="" width={80} height={45} className="h-[45px] w-20 rounded object-cover" />
                  </td>
                  <td className={TD}>{item.title}</td>
                  <td className={TD}>{unitCode(item.unitId)}</td>
                  <td className={TD}>{item.credit || "—"}</td>
                  <td className={TD}>{item.sortOrder}</td>
                  <td className={TD}>
                    {canWrite ? (
                      <Button onClick={() => setTarget({ mode: "edit", item })} aria-label={`Editar ${item.title}`} data-testid="gallery-edit">
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
      {target ? <GalleryDialog key={target.mode === "edit" ? target.item.id : "new"} developmentId={developmentId} target={target} onClose={() => setTarget(null)} /> : null}
    </div>
  );
}

function GalleryDialog({ developmentId, target, onClose }: { developmentId: string; target: EditTarget; onClose: () => void }) {
  const queryClient = useQueryClient();
  const item = target.mode === "edit" ? target.item : null;
  const [title, setTitle] = useState(item?.title ?? "");
  const [unitId, setUnitId] = useState<string | null>(item?.unitId ?? null);
  const [credit, setCredit] = useState(item?.credit ?? "");
  const [sortOrder, setSortOrder] = useState(String(item?.sortOrder ?? 0));
  const image = useImageInput({ required: !item });
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});

  const refresh = () => void queryClient.invalidateQueries({ queryKey: keys.gallery(developmentId) });

  const save = useMutation({
    mutationFn: async (input: GalleryItemInput) => {
      const imageAssetId = await image.upload();
      const body = { ...input, ...(imageAssetId ? { imageAssetId } : {}) };
      return item
        ? api<GalleryItem>(`/admin/gallery/${item.id}`, { method: "PATCH", body })
        : api<GalleryItem>(`/admin/developments/${developmentId}/gallery`, { method: "POST", body });
    },
    onSuccess: () => {
      refresh();
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = GalleryItemInput.safeParse({ title: title.trim(), unitId, credit: credit.trim(), sortOrder: parseNumber(sortOrder) });
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
    <Modal title={item ? `Imagen «${item.title}»` : "Nueva imagen"} onClose={onClose} testId="gallery-dialog">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3" data-testid="gallery-form">
        <TextField label="Título" value={title} error={errors.title} testId="gallery-field-title" onChange={(e) => setTitle(e.target.value)} />
        <UnitSelect developmentId={developmentId} value={unitId} error={errors.unitId} testId="gallery-field-unit" onChange={setUnitId} />
        <TextField label="Crédito" value={credit} error={errors.credit} hint="Autoría o licencia de la imagen." testId="gallery-field-credit" onChange={(e) => setCredit(e.target.value)} />
        <TextField label="Orden" inputMode="numeric" value={sortOrder} error={errors.sortOrder} testId="gallery-field-sortOrder" onChange={(e) => setSortOrder(e.target.value)} />
        <ImageField
          label="Imagen"
          currentUrl={item?.imageUrl}
          error={errors.image}
          testId="gallery-field-image"
          {...image.fieldProps}
        />
        <ErrorBanner error={save.error} testId="gallery-form-error" />
        <div>
          <Button type="submit" variant="primary" disabled={save.isPending} data-testid="gallery-save">
            {save.isPending ? "Guardando…" : item ? "Guardar cambios" : "Crear imagen"}
          </Button>
        </div>
      </form>
      {item ? (
        <ConfirmDelete
          subject={`la imagen «${item.title}»`}
          buttonLabel="Borrar imagen"
          testId="gallery-delete"
          remove={() => api<void>(`/admin/gallery/${item.id}`, { method: "DELETE" })}
          onDeleted={() => {
            refresh();
            onClose();
          }}
        />
      ) : null}
    </Modal>
  );
}
