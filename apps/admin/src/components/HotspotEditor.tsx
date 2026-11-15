"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PanoramaViewer, type PanoramaViewerHandle } from "@synapse/tour-engine";
import { HotspotInput, type Hotspot, type Scene } from "@synapse/contracts";
import { normalizeYaw, radToDeg, type PanoPosition } from "@synapse/domain";
import { api } from "@/lib/api";
import { keys, useScene, useScenes } from "@/lib/queries";
import { useCan } from "@/lib/session";
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from "@/lib/forms";
import { Button, Card, ErrorBanner, QueryBoundary, SelectField, TextAreaField, TextField } from "./ui";

const MOVE_SAVE_DELAY_MS = 400;
const DRAFT_ID = "draft";

type HotspotType = Hotspot["type"];

interface Draft {
  yaw: number;
  pitch: number;
}

interface HotspotFormValues {
  type: HotspotType;
  label: string;
  targetSceneId: string | null;
  description: string | null;
}

export function HotspotEditor({ sceneId }: { sceneId: string }) {
  // The scene shown can change while previewing (navigating a hotspot), so it lives in state.
  const [activeId, setActiveId] = useState(sceneId);
  const canWrite = useCan("scene:write");
  // Preview mode survives navigating between scenes; read-only roles are always in preview.
  const [previewChoice, setPreviewChoice] = useState(false);
  const preview = !canWrite || previewChoice;
  const scene = useScene(activeId);
  return (
    <QueryBoundary query={scene}>
      {(data) => <EditorBody key={data.id} scene={data} preview={preview} onTogglePreview={() => setPreviewChoice((p) => !p)} onNavigate={setActiveId} />}
    </QueryBoundary>
  );
}

function EditorBody({ scene, preview, onTogglePreview, onNavigate }: { scene: Scene; preview: boolean; onTogglePreview: () => void; onNavigate: (sceneId: string) => void }) {
  const queryClient = useQueryClient();
  const canWrite = useCan("scene:write");
  const siblings = useScenes(scene.developmentId);
  const viewerRef = useRef<PanoramaViewerHandle>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savedView, setSavedView] = useState<{ yaw: number; pitch: number; fov: number } | null>(null);
  const moveTimers = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; pos: PanoPosition }>());

  const editing = canWrite && !preview;
  const targets = (siblings.data ?? []).filter((s) => s.id !== scene.id).sort((a, b) => a.sortOrder - b.sortOrder);

  const setHotspots = (fn: (current: Hotspot[]) => Hotspot[]) =>
    queryClient.setQueryData<Scene>(keys.scene(scene.id), (old) => (old ? { ...old, hotspots: fn(old.hotspots) } : old));
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.scene(scene.id) });
    void queryClient.invalidateQueries({ queryKey: keys.scenes(scene.developmentId) });
  };

  const move = useMutation({
    mutationFn: ({ id, pos }: { id: string; pos: PanoPosition }) =>
      api<Hotspot>(`/admin/scenes/${scene.id}/hotspots/${id}`, { method: "PATCH", body: { yaw: pos.yaw, pitch: pos.pitch } }),
    onSuccess: refresh,
    onError: refresh,
  });
  const create = useMutation({
    mutationFn: (body: unknown) => api<Hotspot>(`/admin/scenes/${scene.id}/hotspots`, { method: "POST", body }),
    onSuccess: (created) => {
      setDraft(null);
      setSelectedId(created.id);
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => api<Hotspot>(`/admin/scenes/${scene.id}/hotspots/${id}`, { method: "PATCH", body }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/admin/scenes/${scene.id}/hotspots/${id}`, { method: "DELETE" }),
    onSuccess: (_d, id) => {
      setHotspots((list) => list.filter((h) => h.id !== id));
      setSelectedId(null);
      refresh();
    },
  });
  const saveView = useMutation({
    mutationFn: (view: { yaw: number; pitch: number; fov: number }) => api<Scene>(`/admin/scenes/${scene.id}`, { method: "PATCH", body: { initialView: view } }),
    onSuccess: (_data, view) => {
      setSavedView(view);
      refresh();
    },
  });

  // Flush pending drag saves when leaving.
  useEffect(() => {
    const timers = moveTimers.current;
    return () => {
      for (const [id, entry] of timers) {
        clearTimeout(entry.timer);
        void api(`/admin/scenes/${scene.id}/hotspots/${id}`, { method: "PATCH", body: { yaw: entry.pos.yaw, pitch: entry.pos.pitch } }).catch(() => undefined);
      }
      timers.clear();
    };
  }, [scene.id]);

  const onHotspotMove = (id: string, pos: PanoPosition) => {
    if (id === DRAFT_ID) {
      setDraft({ yaw: pos.yaw, pitch: pos.pitch });
      return;
    }
    setHotspots((list) => list.map((h) => (h.id === id ? { ...h, yaw: pos.yaw, pitch: pos.pitch } : h)));
    const timers = moveTimers.current;
    const existing = timers.get(id);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      timers.delete(id);
      move.mutate({ id, pos });
    }, MOVE_SAVE_DELAY_MS);
    timers.set(id, { timer, pos });
  };

  const onPanoClick = (pos: PanoPosition) => {
    if (!editing) return;
    setDraft({ yaw: pos.yaw, pitch: pos.pitch });
    setSelectedId(DRAFT_ID);
    create.reset();
  };

  const saveInitialView = () => {
    const view = viewerRef.current?.getView();
    if (!view) return;
    setSavedView(null);
    saveView.mutate({
      yaw: normalizeYaw(view.yaw),
      pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, view.pitch)),
      fov: Math.max(0.3, Math.min(2.2, view.fov)),
    });
  };

  const togglePreview = () => {
    onTogglePreview();
    setDraft(null);
    setSelectedId(null);
  };

  const draftHotspot: Hotspot | null = draft
    ? { id: DRAFT_ID, sceneId: scene.id, type: "INFO", label: "Nuevo hotspot", yaw: draft.yaw, pitch: draft.pitch, targetSceneId: null, description: null }
    : null;
  const viewerHotspots = draftHotspot ? [...scene.hotspots, draftHotspot] : scene.hotspots;
  const selected = scene.hotspots.find((h) => h.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-1 text-sm">
            <Link href={`/developments/${scene.developmentId}`} className="text-blue-700 underline" data-testid="scene-back">
              ← Volver al desarrollo
            </Link>
          </p>
          <h1 className="text-2xl font-semibold" data-testid="scene-title">
            {scene.name}
          </h1>
          <p className="text-sm text-gray-600">
            {preview ? "Vista previa: navega por los hotspots como lo haría un visitante." : "Edición: haz clic en el panorama para crear un hotspot; arrastra para moverlo."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={togglePreview} aria-pressed={preview} disabled={!canWrite} data-testid="preview-toggle">
            {preview ? "Volver a editar" : "Vista previa"}
          </Button>
          <Button onClick={saveInitialView} disabled={!canWrite || saveView.isPending} data-testid="initial-view-save">
            Guardar vista inicial
          </Button>
        </div>
      </div>
      {!canWrite ? <p className="text-sm text-gray-600">Solo lectura: tu rol no puede editar hotspots.</p> : null}
      <ErrorBanner error={saveView.error} testId="initial-view-error" />
      {savedView ? (
        <p role="status" data-testid="initial-view-saved" className="text-sm text-green-800">
          Vista inicial guardada (yaw {Math.round(radToDeg(savedView.yaw))}°, pitch {Math.round(radToDeg(savedView.pitch))}°, fov {Math.round(radToDeg(savedView.fov))}°).
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div data-testid="hotspot-editor" data-mode={editing ? "edit" : "preview"} className="overflow-hidden rounded-lg border border-gray-300 bg-black">
          <PanoramaViewer
            ref={viewerRef}
            className="block h-[70vh] min-h-[320px] w-full"
            scene={scene}
            hotspots={viewerHotspots}
            initialView={scene.initialView}
            editable={editing}
            selectedHotspotId={editing ? selectedId : null}
            onHotspotSelect={(id) => {
              setSelectedId(id);
              if (id !== DRAFT_ID) setDraft(null);
            }}
            onPanoClick={editing ? onPanoClick : undefined}
            onHotspotMove={editing ? onHotspotMove : undefined}
            onNavigate={(targetId) => {
              if (!editing) onNavigate(targetId);
            }}
          />
        </div>
        <div className="flex flex-col gap-4">
          <Card title={`Hotspots (${scene.hotspots.length})`}>
            {scene.hotspots.length === 0 && !draft ? (
              <p className="text-sm text-gray-600" data-testid="hotspots-empty">
                Esta escena no tiene hotspots. {canWrite ? "Haz clic en el panorama para crear el primero." : ""}
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {scene.hotspots.map((h, i) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      data-testid={`hotspot-item-${i}`}
                      aria-pressed={selectedId === h.id}
                      onClick={() => {
                        setDraft(null);
                        setSelectedId(h.id);
                        viewerRef.current?.lookAt({ yaw: h.yaw, pitch: h.pitch }, 400);
                      }}
                      className={`flex w-full min-h-10 items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-left text-sm ${selectedId === h.id ? "border-blue-600 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}
                    >
                      <span>{h.label}</span>
                      <span className="text-xs text-gray-600">{h.type === "NAVIGATION" ? "Navegación" : "Info"}</span>
                    </button>
                  </li>
                ))}
                {draft ? (
                  <li>
                    <button
                      type="button"
                      data-testid={`hotspot-item-${scene.hotspots.length}`}
                      data-draft="true"
                      aria-pressed
                      className="flex w-full min-h-10 items-center justify-between gap-2 rounded-md border border-dashed border-blue-600 bg-blue-50 px-3 py-1.5 text-left text-sm"
                    >
                      <span>Nuevo hotspot</span>
                      <span className="text-xs text-gray-600">sin guardar</span>
                    </button>
                  </li>
                ) : null}
              </ul>
            )}
          </Card>
          {editing ? (
            <Card title={draft ? "Nuevo hotspot" : selected ? "Editar hotspot" : "Hotspot"}>
              {draft ? (
                <HotspotForm
                  key="draft"
                  mode="create"
                  targets={targets}
                  pending={create.isPending}
                  error={create.error}
                  position={draft}
                  onSubmit={(values) => create.mutate({ ...values, yaw: draft.yaw, pitch: draft.pitch })}
                  onCancel={() => {
                    setDraft(null);
                    setSelectedId(null);
                  }}
                />
              ) : selected ? (
                <HotspotForm
                  key={selected.id}
                  mode="edit"
                  initial={selected}
                  targets={targets}
                  pending={update.isPending}
                  error={update.error ?? remove.error ?? move.error}
                  position={selected}
                  deleting={remove.isPending}
                  onSubmit={(values) => update.mutate({ id: selected.id, body: values })}
                  onDelete={() => remove.mutate(selected.id)}
                />
              ) : (
                <p className="text-sm text-gray-600" data-testid="hotspot-hint">
                  Selecciona un hotspot de la lista o del panorama, o haz clic en el panorama para crear uno nuevo.
                </p>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function HotspotForm({
  mode,
  initial,
  targets,
  pending,
  error,
  position,
  deleting = false,
  onSubmit,
  onCancel,
  onDelete,
}: {
  mode: "create" | "edit";
  initial?: Hotspot;
  targets: Scene[];
  pending: boolean;
  error: unknown;
  position: PanoPosition;
  deleting?: boolean;
  onSubmit: (values: HotspotFormValues) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const [type, setType] = useState<HotspotType>(initial?.type ?? "NAVIGATION");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [targetSceneId, setTargetSceneId] = useState(initial?.targetSceneId ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [confirming, setConfirming] = useState(false);
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const values: HotspotFormValues = {
      type,
      label: label.trim(),
      targetSceneId: type === "NAVIGATION" ? targetSceneId || null : null,
      description: type === "INFO" && description.trim() ? description.trim() : null,
    };
    const parsed = HotspotInput.safeParse({ ...values, yaw: position.yaw, pitch: position.pitch });
    const errors: FieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error);
    if (type === "NAVIGATION" && !targetSceneId) errors.targetSceneId = "Elige la escena de destino.";
    if (Object.keys(errors).length > 0) {
      setClientErrors(errors);
      return;
    }
    setClientErrors({});
    onSubmit(values);
  };

  const errors = { ...apiFieldErrors(error), ...clientErrors };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3" data-testid="hotspot-form">
      <p className="text-xs text-gray-600" data-testid="hotspot-position">
        yaw {radToDeg(position.yaw).toFixed(1)}° · pitch {radToDeg(position.pitch).toFixed(1)}°
      </p>
      <SelectField label="Tipo" value={type} testId="hotspot-type-select" onChange={(e) => setType(e.target.value as HotspotType)}>
        <option value="NAVIGATION">Navegación (ir a otra escena)</option>
        <option value="INFO">Información</option>
      </SelectField>
      <TextField label="Etiqueta" maxLength={80} value={label} error={errors.label} testId="hotspot-label-input" onChange={(e) => setLabel(e.target.value)} />
      {type === "NAVIGATION" ? (
        <SelectField label="Escena de destino" value={targetSceneId} error={errors.targetSceneId} testId="hotspot-target-select" onChange={(e) => setTargetSceneId(e.target.value)}>
          <option value="">Elige una escena…</option>
          {targets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
      ) : (
        <TextAreaField label="Descripción" maxLength={500} value={description} error={errors.description} testId="hotspot-description-input" onChange={(e) => setDescription(e.target.value)} />
      )}
      <ErrorBanner error={error} testId="hotspot-error" />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={pending} data-testid="hotspot-save">
          {pending ? "Guardando…" : mode === "create" ? "Crear hotspot" : "Guardar"}
        </Button>
        {mode === "create" ? (
          <Button onClick={onCancel} data-testid="hotspot-cancel">
            Cancelar
          </Button>
        ) : confirming ? (
          <span role="alertdialog" aria-label="Confirmar borrado de hotspot" className="inline-flex flex-wrap items-center gap-2 text-sm">
            ¿Borrar?
            <Button variant="danger" disabled={deleting} onClick={onDelete} data-testid="hotspot-delete-confirm">
              Sí, borrar
            </Button>
            <Button onClick={() => setConfirming(false)}>No</Button>
          </span>
        ) : (
          <Button variant="danger" onClick={() => setConfirming(true)} data-testid="hotspot-delete">
            Borrar
          </Button>
        )}
      </div>
    </form>
  );
}
