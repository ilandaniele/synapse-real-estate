"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SceneInput, type Asset, type Scene, type Unit } from "@synapse/contracts";
import { degToRad, radToDeg } from "@synapse/domain";
import { api } from "@/lib/api";
import { keys, useAssets, useScenes, useUnits } from "@/lib/queries";
import { useCan } from "@/lib/session";
import { apiFieldErrors, parseNumber, zodFieldErrors, type FieldErrors } from "@/lib/forms";
import { slugifyText } from "@/lib/format";
import { Button, ErrorBanner, Modal, QueryBoundary, SelectField, TableShell, TD, TextField, TH } from "../ui";
import { EnglishFields, useEnglishText } from "../EnglishFields";

type EditTarget = { mode: "create" } | { mode: "edit"; scene: Scene };

const IMAGE_KINDS = ["jpeg", "png", "webp"];
const round = (n: number, digits = 2) => String(Math.round(n * 10 ** digits) / 10 ** digits);

export function ScenesTab({ developmentId }: { developmentId: string }) {
  const scenes = useScenes(developmentId);
  const units = useUnits(developmentId);
  const canWrite = useCan("scene:write");
  const [target, setTarget] = useState<EditTarget | null>(null);
  const unitById = new Map((units.data ?? []).map((u) => [u.id, u]));

  const createButton = canWrite ? (
    <Button variant="primary" onClick={() => setTarget({ mode: "create" })} data-testid="scene-create-open">
      Nueva escena
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">Panoramas equirrectangulares 2:1 del tour 360. Los hotspots se editan visualmente en cada escena.</p>
        {createButton}
      </div>
      <QueryBoundary
        query={scenes}
        isEmpty={(items) => items.length === 0}
        emptyTitle="Este desarrollo no tiene escenas 360"
        emptyDescription={canWrite ? "Sube un panorama en Activos, procésalo y crea la escena." : undefined}
        emptyAction={createButton}
      >
        {(items) => (
          <TableShell caption="Escenas 360" testId="scenes-table">
            <thead>
              <tr>
                <th className={TH}>Miniatura</th>
                <th className={TH}>Nombre</th>
                <th className={TH}>Slug</th>
                <th className={TH}>Unidad</th>
                <th className={TH}>Orden</th>
                <th className={TH}>Hotspots</th>
                <th className={TH}>Plano</th>
                <th className={TH}>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {[...items]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((scene) => (
                  <tr key={scene.id} data-testid={`scene-row-${scene.slug}`}>
                    <td className={TD}>
                      {scene.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={scene.thumbnailUrl} alt="" width={80} height={45} className="h-[45px] w-20 rounded object-cover" />
                      ) : (
                        <span className="text-xs text-gray-500">—</span>
                      )}
                    </td>
                    <td className={TD}>{scene.name}</td>
                    <td className={TD}>
                      <code>{scene.slug}</code>
                    </td>
                    <td className={TD}>{scene.unitId ? (unitById.get(scene.unitId)?.code ?? "—") : "—"}</td>
                    <td className={TD}>{scene.sortOrder}</td>
                    <td className={TD}>{scene.hotspots.length}</td>
                    <td className={TD}>{scene.floorPlanPoint ? "Ubicada" : "Sin ubicar"}</td>
                    <td className={TD}>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/scenes/${scene.id}`} data-testid={`scene-editor-${scene.slug}`} className="inline-flex min-h-10 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium hover:bg-gray-100">
                          Editor de hotspots
                        </Link>
                        {canWrite ? (
                          <Button onClick={() => setTarget({ mode: "edit", scene })} data-testid={`scene-edit-${scene.slug}`}>
                            Editar
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </TableShell>
        )}
      </QueryBoundary>
      {target ? (
        <SceneDialog
          key={target.mode === "edit" ? target.scene.id : "new"}
          developmentId={developmentId}
          target={target}
          units={units.data ?? []}
          sceneCount={scenes.data?.length ?? 0}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </div>
  );
}

function SceneDialog({ developmentId, target, units, sceneCount, onClose }: { developmentId: string; target: EditTarget; units: Unit[]; sceneCount: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const assets = useAssets();
  const scene = target.mode === "edit" ? target.scene : null;

  const [name, setName] = useState(scene?.name ?? "");
  const [slug, setSlug] = useState(scene?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(scene));
  const [unitId, setUnitId] = useState(scene?.unitId ?? "");
  const [sortOrder, setSortOrder] = useState(String(scene?.sortOrder ?? sceneCount));
  const [assetId, setAssetId] = useState("");
  const [panoramaUrl, setPanoramaUrl] = useState("");
  const [yaw, setYaw] = useState(round(radToDeg(scene?.initialView.yaw ?? 0)));
  const [pitch, setPitch] = useState(round(radToDeg(scene?.initialView.pitch ?? 0)));
  const [fov, setFov] = useState(round(radToDeg(scene?.initialView.fov ?? 1.4), 1));
  const [viewTouched, setViewTouched] = useState(false);
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const english = useEnglishText(scene?.translations);

  const panoramaAssets: Asset[] = (assets.data ?? []).filter((a) => a.status === "UPLOADED" && a.kind !== null && IMAGE_KINDS.includes(a.kind));

  const save = useMutation({
    mutationFn: (body: unknown) =>
      scene ? api<Scene>(`/admin/scenes/${scene.id}`, { method: "PATCH", body }) : api<Scene>(`/admin/developments/${developmentId}/scenes`, { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.scenes(developmentId) });
      if (scene) void queryClient.invalidateQueries({ queryKey: keys.scene(scene.id) });
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const candidate = {
      unitId: unitId === "" ? null : unitId,
      slug: slug.trim(),
      name: name.trim(),
      sortOrder: parseNumber(sortOrder),
      translations: english.translations,
      ...(assetId ? { panoramaAssetId: assetId } : {}),
      ...(panoramaUrl.trim() ? { panoramaUrl: panoramaUrl.trim() } : {}),
      ...(!scene || viewTouched
        ? { initialView: { yaw: degToRad(parseNumber(yaw)), pitch: degToRad(parseNumber(pitch)), fov: degToRad(parseNumber(fov)) } }
        : {}),
    };
    const parsed = SceneInput.safeParse(candidate);
    const errors: FieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error);
    if (!scene && !assetId && !panoramaUrl.trim()) errors.panorama = "Elige un panorama procesado o indica una URL/ruta /media/.";
    if (!parsed.success || Object.keys(errors).length > 0) {
      setClientErrors(errors);
      return;
    }
    setClientErrors({});
    save.mutate(parsed.data);
  };

  const errors = { ...apiFieldErrors(save.error), ...clientErrors };

  return (
    <Modal title={scene ? `Escena ${scene.name}` : "Nueva escena"} onClose={onClose} testId="scene-dialog" wide>
      <form onSubmit={submit} noValidate className="grid gap-3 md:grid-cols-2" data-testid="scene-form">
        <TextField
          label="Nombre"
          value={name}
          error={errors.name}
          testId="scene-field-name"
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugifyText(e.target.value));
          }}
        />
        <TextField
          label="Slug"
          value={slug}
          error={errors.slug}
          testId="scene-field-slug"
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
        />
        <EnglishFields fields={[{ name: "name", label: "Nombre" }]} {...english} errors={errors} testId="scene-field-en" />
        <SelectField label="Unidad" value={unitId} error={errors.unitId} testId="scene-field-unit" onChange={(e) => setUnitId(e.target.value)}>
          <option value="">Sin unidad (común)</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.code} · {u.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Orden" inputMode="numeric" value={sortOrder} error={errors.sortOrder} testId="scene-field-sortOrder" onChange={(e) => setSortOrder(e.target.value)} />
        <SelectField
          label="Panorama procesado (activo)"
          value={assetId}
          error={errors.panorama ?? errors.panoramaAssetId}
          hint={scene ? "Déjalo vacío para conservar el panorama actual. El activo debe estar procesado (Activos > Procesar)." : "El activo debe estar procesado (Activos > Procesar)."}
          testId="scene-field-asset"
          onChange={(e) => setAssetId(e.target.value)}
        >
          <option value="">— ninguno —</option>
          {panoramaAssets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.filename}
            </option>
          ))}
        </SelectField>
        <TextField
          label="o URL / ruta de panorama"
          value={panoramaUrl}
          error={errors.panoramaUrl}
          hint="https://… o una ruta /media/… (equirrectangular 2:1)."
          testId="scene-field-url"
          placeholder={scene?.panoramaUrl}
          onChange={(e) => setPanoramaUrl(e.target.value)}
        />
        <fieldset className="grid gap-3 rounded-md border border-gray-200 p-3 md:col-span-2 md:grid-cols-3">
          <legend className="px-1 text-sm font-semibold">Vista inicial (grados)</legend>
          <TextField label="Yaw (−180 a 180)" inputMode="decimal" value={yaw} error={errors["initialView.yaw"]} testId="scene-field-yaw" onChange={(e) => { setViewTouched(true); setYaw(e.target.value); }} />
          <TextField label="Pitch (−90 a 90)" inputMode="decimal" value={pitch} error={errors["initialView.pitch"]} testId="scene-field-pitch" onChange={(e) => { setViewTouched(true); setPitch(e.target.value); }} />
          <TextField label="FOV (17 a 126)" inputMode="decimal" value={fov} error={errors["initialView.fov"]} testId="scene-field-fov" onChange={(e) => { setViewTouched(true); setFov(e.target.value); }} />
          <p className="text-xs text-gray-500 md:col-span-3">También puedes fijarla visualmente con «Guardar vista inicial» en el editor de hotspots.</p>
        </fieldset>
        <div className="flex flex-col gap-2 md:col-span-2">
          <ErrorBanner error={save.error} testId="scene-form-error" />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={save.isPending} data-testid="scene-save">
              {save.isPending ? "Guardando…" : scene ? "Guardar cambios" : "Crear escena"}
            </Button>
            {scene ? <DeleteScene sceneId={scene.id} developmentId={developmentId} onDeleted={onClose} /> : null}
          </div>
        </div>
      </form>
    </Modal>
  );
}

function DeleteScene({ sceneId, developmentId, onDeleted }: { sceneId: string; developmentId: string; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const del = useMutation({
    mutationFn: () => api<void>(`/admin/scenes/${sceneId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.scenes(developmentId) });
      onDeleted();
    },
  });
  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)} data-testid="scene-delete">
        Borrar escena
      </Button>
    );
  }
  return (
    <span role="alertdialog" aria-label="Confirmar borrado de escena" className="inline-flex flex-wrap items-center gap-2 rounded-md border border-red-300 bg-red-50 p-2 text-sm">
      Se borrarán también sus hotspots.
      <Button variant="danger" disabled={del.isPending} onClick={() => del.mutate()} data-testid="scene-delete-confirm">
        Sí, borrar
      </Button>
      <Button onClick={() => setConfirming(false)}>Cancelar</Button>
      {del.error ? <ErrorBanner error={del.error} /> : null}
    </span>
  );
}
