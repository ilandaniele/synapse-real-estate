"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FloorPlanMap } from "@synapse/tour-engine";
import type { FloorPlan, Scene } from "@synapse/contracts";
import type { NormalizedPoint } from "@synapse/domain";
import { api } from "@/lib/api";
import { keys, useFloorPlans, useScenes } from "@/lib/queries";
import { useCan } from "@/lib/session";
import { Button, Card, ErrorBanner, QueryBoundary, SelectField } from "../ui";

const SAVE_DELAY_MS = 500;

export function FloorPlanTab({ developmentId }: { developmentId: string }) {
  const plans = useFloorPlans(developmentId);
  const scenes = useScenes(developmentId);
  return (
    <QueryBoundary query={plans} isEmpty={(items) => items.length === 0} emptyTitle="Este desarrollo no tiene planos" emptyDescription="Los planos se cargan desde el seed o el pipeline de assets; todavía no hay endpoint de subida de planos.">
      {(planList) => (
        <QueryBoundary query={scenes} isEmpty={(items) => items.length === 0} emptyTitle="Crea escenas antes de ubicarlas en el plano">
          {(sceneList) => <PlanEditor developmentId={developmentId} plans={planList} scenes={sceneList} />}
        </QueryBoundary>
      )}
    </QueryBoundary>
  );
}

function PlanEditor({ developmentId, plans, scenes }: { developmentId: string; plans: FloorPlan[]; scenes: Scene[] }) {
  const queryClient = useQueryClient();
  const canWrite = useCan("scene:write");
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  const planScenes = scenes.filter((s) => !plan?.unitId || s.unitId === plan.unitId || s.unitId === null).sort((a, b) => a.sortOrder - b.sortOrder);
  const [currentId, setCurrentId] = useState(planScenes[0]?.id ?? "");
  const current = planScenes.find((s) => s.id === currentId) ?? planScenes[0];
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const pending = useRef(new Map<string, NormalizedPoint>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useMutation({
    mutationFn: ({ sceneId, point }: { sceneId: string; point: NormalizedPoint | null }) =>
      api<Scene>(`/admin/scenes/${sceneId}`, { method: "PATCH", body: { floorPlanPoint: point } }),
    onSuccess: (_data, vars) => {
      setSavedAt(new Date().toLocaleTimeString("es-ES"));
      void queryClient.invalidateQueries({ queryKey: keys.scene(vars.sceneId) });
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: keys.scenes(developmentId) }),
  });

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    for (const [sceneId, point] of pending.current) save.mutate({ sceneId, point });
    pending.current.clear();
    // `save.mutate` is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Don't lose the last drag when leaving the tab.
  useEffect(() => flush, [flush]);

  const setPoint = (sceneId: string, point: NormalizedPoint | null) => {
    // Optimistic: reflect immediately in the cached scene list, persist after a short pause.
    queryClient.setQueryData<Scene[]>(keys.scenes(developmentId), (old) => old?.map((s) => (s.id === sceneId ? { ...s, floorPlanPoint: point } : s)));
    if (point) pending.current.set(sceneId, point);
    else save.mutate({ sceneId, point: null });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  if (!plan) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <Card title="Escenas">
        {plans.length > 1 ? (
          <SelectField label="Plano" value={plan.id} testId="plan-select" onChange={(e) => setPlanId(e.target.value)} className="mb-3">
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <p className="mb-3 text-sm font-medium">{plan.name}</p>
        )}
        <p className="mb-2 text-xs text-gray-600">
          {canWrite ? "Elige una escena y haz clic en el plano para ubicarla, o arrastra su marcador." : "Solo lectura: tu rol no puede mover escenas."}
        </p>
        <ul className="flex flex-col gap-1" data-testid="plan-scene-list">
          {planScenes.map((scene) => (
            <li key={scene.id}>
              <button
                type="button"
                aria-pressed={current?.id === scene.id}
                data-testid={`plan-scene-${scene.slug}`}
                onClick={() => setCurrentId(scene.id)}
                className={`flex w-full min-h-10 items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-left text-sm ${current?.id === scene.id ? "border-blue-600 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}
              >
                <span>{scene.name}</span>
                <span className="text-xs text-gray-600">{scene.floorPlanPoint ? "ubicada" : "sin ubicar"}</span>
              </button>
              {canWrite && scene.floorPlanPoint ? (
                <Button variant="ghost" className="min-h-8 text-xs" onClick={() => setPoint(scene.id, null)} data-testid={`plan-clear-${scene.slug}`}>
                  Quitar del plano
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Plano" actions={savedAt ? <span role="status" data-testid="plan-saved" className="text-xs text-green-800">Guardado {savedAt}</span> : undefined}>
        <ErrorBanner error={save.error} testId="plan-error" />
        <div className="mx-auto max-w-[900px]" data-testid="plan-editor">
          <FloorPlanMap
            plan={plan}
            scenes={planScenes}
            currentSceneId={current?.id ?? ""}
            onSelect={setCurrentId}
            editable={canWrite}
            onPointMove={(sceneId, point) => setPoint(sceneId, point)}
          />
        </div>
      </Card>
    </div>
  );
}
