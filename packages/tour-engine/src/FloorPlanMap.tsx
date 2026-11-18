"use client";

import { useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { FloorPlan, Scene } from "@synapse/contracts";
import { DEFAULT_LOCALE, type Locale, type NormalizedPoint } from "@synapse/domain";
import { exceedsDragThreshold, pointFromClient, slugify, toPercentStyle } from "./geometry";
import { TOUR_STRINGS } from "./strings";
import { TourStyles } from "./TourStyles";

export interface FloorPlanMapProps {
  plan: FloorPlan;
  scenes: Scene[];
  currentSceneId: string;
  onSelect: (sceneId: string) => void;
  /** `modal`: large, fills its container up to 900px. `mini`: compact 260px overlay-sized plan. */
  variant?: "modal" | "mini";
  /**
   * Editor mode: markers are draggable and clicking an empty spot of the plan places the scene
   * identified by `currentSceneId` there.
   */
  editable?: boolean;
  onPointMove?: (sceneId: string, point: NormalizedPoint) => void;
  className?: string;
  locale?: Locale;
}

const DRAG_START_PX = 4;

export function FloorPlanMap({
  plan,
  scenes,
  currentSceneId,
  onSelect,
  variant = "modal",
  editable = false,
  onPointMove,
  className,
  locale = DEFAULT_LOCALE,
}: FloorPlanMapProps) {
  const strings = TOUR_STRINGS[locale];
  const mapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ sceneId: string; pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [imageFailed, setImageFailed] = useState(false);

  const mini = variant === "mini";
  const sorted = [...scenes].sort((a, b) => a.sortOrder - b.sortOrder);
  const placed = sorted.filter((s) => s.floorPlanPoint !== null);

  const placeAt = (sceneId: string, clientX: number, clientY: number) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (rect) onPointMove?.(sceneId, pointFromClient(clientX, clientY, rect));
  };

  const onMapClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!editable || !currentSceneId) return;
    if (e.target instanceof Element && e.target.closest("[data-floorplan-point]")) return;
    placeAt(currentSceneId, e.clientX, e.clientY);
  };

  const onMarkerPointerDown = (e: ReactPointerEvent<HTMLButtonElement>, sceneId: string) => {
    if (!editable || e.button !== 0) return;
    drag.current = { sceneId, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMarkerPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.moved && !exceedsDragThreshold(e.clientX - d.startX, e.clientY - d.startY, DRAG_START_PX)) return;
    d.moved = true;
    placeAt(d.sceneId, e.clientX, e.clientY);
  };
  const onMarkerPointerEnd = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    suppressClick.current = d.moved;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className={className}
      data-testid="floorplan"
      data-variant={variant}
      style={{ width: "100%", maxWidth: mini ? 260 : 900 }}
    >
      <TourStyles />
      <div
        ref={mapRef}
        onClick={onMapClick}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: `${plan.width} / ${plan.height}`,
          background: "#fff",
          borderRadius: 8,
          overflow: "hidden",
          cursor: editable ? "crosshair" : "default",
          userSelect: "none",
        }}
      >
        {imageFailed ? (
          <div role="alert" data-testid="floorplan-error" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 8, textAlign: "center", fontSize: 13, color: "#374151" }}>
            {strings.planError}
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={plan.imageUrl}
            alt={strings.planAlt(plan.name)}
            draggable={false}
            onError={() => setImageFailed(true)}
            style={{ display: "block", width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
          />
        )}

        {placed.map((scene) => {
          const point = scene.floorPlanPoint;
          if (!point) return null;
          const current = scene.id === currentSceneId;
          const slug = slugify(scene.slug || scene.name);
          return (
            <button
              key={scene.id}
              type="button"
              data-testid={`floorplan-point-${slug}`}
              data-floorplan-point={scene.id}
              data-current={current}
              aria-label={strings.goTo(scene.name)}
              aria-current={current ? "true" : undefined}
              title={scene.name}
              onPointerDown={(e) => onMarkerPointerDown(e, scene.id)}
              onPointerMove={onMarkerPointerMove}
              onPointerUp={onMarkerPointerEnd}
              onPointerCancel={onMarkerPointerEnd}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                onSelect(scene.id);
              }}
              style={{
                position: "absolute",
                ...toPercentStyle(point),
                width: 44,
                height: 44,
                transform: "translate(-50%, -50%)",
                padding: 0,
                border: 0,
                background: "transparent",
                cursor: editable ? "grab" : "pointer",
                touchAction: editable ? "none" : "manipulation",
                zIndex: current ? 2 : 1,
              }}
            >
              {current ? <span className="syn-fp-ring" aria-hidden="true" /> : null}
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: current ? 16 : 12,
                  height: current ? 16 : 12,
                  transform: "translate(-50%, -50%)",
                  borderRadius: 9999,
                  background: current ? "#2563eb" : "#475569",
                  border: "2px solid #fff",
                  boxShadow: "0 1px 4px rgba(0,0,0,.5)",
                }}
              />
            </button>
          );
        })}
      </div>

      {sorted.length === 0 ? (
        <p data-testid="floorplan-empty" style={{ margin: "8px 0 0", fontSize: 13, opacity: 0.75 }}>
          {strings.noScenes}
        </p>
      ) : (
        <ul
          aria-label={strings.planScenes}
          style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexWrap: "wrap", gap: mini ? 4 : 8 }}
        >
          {sorted.map((scene) => {
            const current = scene.id === currentSceneId;
            return (
              <li key={scene.id}>
                <button
                  type="button"
                  data-testid={`floorplan-chip-${slugify(scene.slug || scene.name)}`}
                  aria-pressed={current}
                  onClick={() => onSelect(scene.id)}
                  style={{
                    minHeight: 44,
                    padding: mini ? "0 10px" : "0 16px",
                    fontSize: mini ? 12 : 14,
                    borderRadius: 9999,
                    border: "1px solid #94a3b8",
                    background: current ? "#2563eb" : "#fff",
                    color: current ? "#fff" : "#111827",
                    cursor: "pointer",
                  }}
                >
                  {scene.name}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
