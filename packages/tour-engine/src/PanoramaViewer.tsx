"use client";

/// <reference path="./marzipano.d.ts" />
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";
import type * as Marzipano from "marzipano";
import type { Hotspot, Scene } from "@synapse/contracts";
import { degToRad, normalizePanoPosition, type PanoPosition } from "@synapse/domain";
import { exceedsDragThreshold, slugify, viewDeltaForKey, type PanoView } from "./geometry";
import type { HotspotCallbacks } from "./hotspot-dom";
import { destroyRecordHotspots, syncHotspots, type SceneRecord } from "./hotspot-layer";
import { TourStyles } from "./TourStyles";
import { hasWebGL } from "./webgl";

export interface PanoramaViewerHandle {
  /** Moves the camera. `durationMs` 0 (default) jumps, >0 animates. Missing keys keep their value. */
  lookAt(view: Partial<PanoView>, durationMs?: number): void;
  /** Current camera, or `null` before the first scene is mounted. */
  getView(): PanoView | null;
}

export interface PanoramaViewerProps {
  scene: Scene;
  /** Defaults to `scene.hotspots`. */
  hotspots?: Hotspot[];
  onNavigate: (targetSceneId: string) => void;
  onViewChange?: (view: PanoView) => void;
  /** Editor mode: hotspots are draggable and clicks select instead of navigate. */
  editable?: boolean;
  /** Fires on a click (not a drag) on the panorama itself, with the clicked yaw/pitch. */
  onPanoClick?: (position: PanoPosition) => void;
  onHotspotMove?: (hotspotId: string, position: PanoPosition) => void;
  selectedHotspotId?: string | null;
  onHotspotSelect?: (hotspotId: string) => void;
  /** Sizing is up to the consumer; without a className the viewer fills its parent. */
  className?: string;
  /** Overrides `scene.initialView` when a scene is mounted. */
  initialView?: PanoView;
  ref?: Ref<PanoramaViewerHandle>;
}

type Status = "loading" | "ready" | "error" | "nowebgl";

const FULL_WIDTH = 4096;
const PREVIEW_WIDTH = 1024;
const SCENE_FADE_MS = 600;
const CLICK_THRESHOLD_PX = 5;

type MzModule = typeof Marzipano;

async function loadMarzipano(): Promise<MzModule> {
  // marzipano is CommonJS: depending on the bundler the API sits on `default` or on the namespace.
  const mod = (await import("marzipano")) as MzModule & { default?: MzModule };
  return mod.default ?? mod;
}

const readView = (view: Marzipano.RectilinearView): PanoView => ({
  yaw: view.yaw(),
  pitch: view.pitch(),
  fov: view.fov(),
});

export function PanoramaViewer(props: PanoramaViewerProps) {
  const { scene, className, editable = false, selectedHotspotId, ref } = props;
  const hotspots = props.hotspots ?? scene.hotspots;

  const stageRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Marzipano.Viewer | null>(null);
  const mzRef = useRef<MzModule | null>(null);
  const recordsRef = useRef(new Set<SceneRecord>());
  const currentRef = useRef<SceneRecord | null>(null);
  const latest = useRef(props);
  const pointerDown = useRef<{ x: number; y: number } | null>(null);

  const [viewerReady, setViewerReady] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [retryKey, setRetryKey] = useState(0);
  const [sceneRev, setSceneRev] = useState(0);

  useEffect(() => {
    latest.current = props;
  });

  const toPano = useCallback((clientX: number, clientY: number): PanoPosition | null => {
    const view = currentRef.current?.mz.view();
    const el = stageRef.current;
    if (!view || !el) return null;
    const rect = el.getBoundingClientRect();
    return normalizePanoPosition(view.screenToCoordinates({ x: clientX - rect.left, y: clientY - rect.top }));
  }, []);

  const hotspotCallbacks = useMemo<HotspotCallbacks>(
    () => ({
      onActivate: (h) => {
        if (h.targetSceneId) latest.current.onNavigate(h.targetSceneId);
      },
      onSelect: (h) => latest.current.onHotspotSelect?.(h.id),
      onDragTo: (h, clientX, clientY) => {
        const pos = toPano(clientX, clientY);
        if (!pos) return;
        currentRef.current?.hotspots.get(h.id)?.hotspot.setPosition(pos);
        latest.current.onHotspotMove?.(h.id, pos);
      },
    }),
    [toPano],
  );

  useImperativeHandle(
    ref,
    () => ({
      lookAt(view, durationMs = 0) {
        const mzScene = currentRef.current?.mz;
        if (!mzScene) return;
        if (durationMs > 0) mzScene.lookTo(view, { transitionDuration: durationMs });
        else mzScene.view().setParameters(view);
      },
      getView() {
        const view = currentRef.current?.mz.view();
        return view ? readView(view) : null;
      },
    }),
    [],
  );

  // Viewer lifecycle: one Marzipano viewer per component instance, created client-side only.
  useEffect(() => {
    const stageEl = stageRef.current;
    if (!stageEl) return;
    if (!hasWebGL()) {
      setStatus("nowebgl");
      return;
    }
    let cancelled = false;
    let viewer: Marzipano.Viewer | null = null;
    let observer: ResizeObserver | null = null;
    const records = recordsRef.current;

    void (async () => {
      try {
        const mz = await loadMarzipano();
        if (cancelled) return;
        viewer = new mz.Viewer(stageEl, { stage: { progressive: true } });
        mzRef.current = mz;
        viewerRef.current = viewer;
        const v = viewer;
        observer = new ResizeObserver(() => v.updateSize());
        observer.observe(stageEl);
        setViewerReady(true);
      } catch {
        if (!cancelled) setStatus("nowebgl");
      }
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      for (const record of records) destroyRecordHotspots(record);
      records.clear();
      currentRef.current = null;
      viewer?.destroy();
      viewerRef.current = null;
      mzRef.current = null;
      stageEl.replaceChildren();
      setViewerReady(false);
    };
  }, []);

  // Scene lifecycle: new Marzipano scene on the shared viewer, cross-fade, drop stale scenes.
  const previewUrl = scene.previewUrl;
  const panoramaUrl = scene.panoramaUrl;
  useEffect(() => {
    const mz = mzRef.current;
    const viewer = viewerRef.current;
    if (!viewerReady || !mz || !viewer) return;

    const start: PanoView = latest.current.initialView ?? scene.initialView;
    const levels = previewUrl ? [{ width: PREVIEW_WIDTH }, { width: FULL_WIDTH }] : [{ width: FULL_WIDTH }];
    const source = new mz.ImageUrlSource((tile) => ({ url: previewUrl && tile.z === 0 ? previewUrl : panoramaUrl }));
    const limiter = mz.RectilinearView.limit.traditional(FULL_WIDTH, degToRad(100));
    const view = new mz.RectilinearView({ yaw: start.yaw, pitch: start.pitch, fov: start.fov }, limiter);
    const mzScene = viewer.createScene({
      source,
      geometry: new mz.EquirectGeometry(levels),
      view,
      pinFirstLevel: true,
    });
    const record: SceneRecord = { sceneId: scene.id, mz: mzScene, hotspots: new Map() };

    const store = mzScene.layer().textureStore();
    let loaded = false;
    const onLoad = () => {
      loaded = true;
      if (currentRef.current === record) setStatus("ready");
    };
    const onError = () => {
      if (!loaded && currentRef.current === record) setStatus("error");
    };
    const onViewChange = () => latest.current.onViewChange?.(readView(view));
    store.addEventListener("textureLoad", onLoad);
    store.addEventListener("textureError", onError);
    view.addEventListener("change", onViewChange);

    const previous = currentRef.current;
    previous?.mz.hotspotContainer().hide();
    currentRef.current = record;
    recordsRef.current.add(record);
    setStatus("loading");

    const sweep = () => {
      if (viewerRef.current !== viewer) return;
      for (const stale of [...recordsRef.current]) {
        if (stale === currentRef.current) continue;
        destroyRecordHotspots(stale);
        try {
          viewer.destroyScene(stale.mz);
        } catch {
          // already gone
        }
        recordsRef.current.delete(stale);
      }
    };
    mzScene.switchTo({ transitionDuration: previous ? SCENE_FADE_MS : 0 }, sweep);
    setSceneRev((n) => n + 1);

    return () => {
      store.removeEventListener("textureLoad", onLoad);
      store.removeEventListener("textureError", onError);
      view.removeEventListener("change", onViewChange);
    };
    // initialView is read through `latest` on purpose: it must not re-create the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerReady, scene.id, previewUrl, panoramaUrl, retryKey]);

  // Hotspots: reconcile DOM with props whenever they (or the editor state) change.
  useEffect(() => {
    const record = currentRef.current;
    if (!viewerReady || !record) return;
    syncHotspots(record, hotspots, { selectedHotspotId, editable, callbacks: hotspotCallbacks });
  }, [viewerReady, sceneRev, hotspots, selectedHotspotId, editable, hotspotCallbacks]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const view = currentRef.current?.mz.view();
    if (!view) return;
    const delta = viewDeltaForKey(e.key, view.fov());
    if (!delta) return;
    e.preventDefault();
    if (delta.yaw) view.offsetYaw(delta.yaw);
    if (delta.pitch) view.offsetPitch(delta.pitch);
    if (delta.fov) view.offsetFov(delta.fov);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointerDown.current = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const down = pointerDown.current;
    pointerDown.current = null;
    if (!down || !props.onPanoClick) return;
    if (e.target instanceof Element && e.target.closest("[data-hotspot-root]")) return;
    if (exceedsDragThreshold(e.clientX - down.x, e.clientY - down.y, CLICK_THRESHOLD_PX)) return;
    const pos = toPano(e.clientX, e.clientY);
    if (pos) props.onPanoClick(pos);
  };

  const rootStyle: CSSProperties = {
    position: "relative",
    overflow: "hidden",
    background: "#0b0f14",
    outlineOffset: -3,
    ...(className ? null : { width: "100%", height: "100%" }),
  };

  const fallbackNav = hotspots.filter((h) => h.type === "NAVIGATION" && h.targetSceneId);

  return (
    <div
      className={className}
      style={rootStyle}
      data-testid="panorama-viewer"
      data-scene-id={scene.id}
      data-scene-slug={scene.slug}
      data-status={status}
      tabIndex={0}
      role="application"
      aria-label={`Panorama 360: ${scene.name}`}
      aria-busy={status === "loading"}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <TourStyles />
      <div ref={stageRef} style={{ position: "absolute", inset: 0 }} />

      {status === "loading" ? (
        <div
          role="status"
          aria-label="Cargando panorama"
          data-testid="panorama-loading"
          style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(11,15,20,.55)", pointerEvents: "none" }}
        >
          <span className="syn-tour-spinner" aria-hidden="true" />
        </div>
      ) : null}

      {status === "error" ? (
        <div
          role="alert"
          data-testid="panorama-error"
          style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "rgba(11,15,20,.85)", color: "#fff", textAlign: "center", padding: 16 }}
        >
          <p style={{ margin: 0 }}>No se pudo cargar el panorama de «{scene.name}».</p>
          <button
            type="button"
            data-testid="panorama-retry"
            onClick={() => setRetryKey((n) => n + 1)}
            style={{ minHeight: 44, padding: "0 20px", borderRadius: 8, border: "1px solid #fff", background: "transparent", color: "#fff", cursor: "pointer" }}
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {status === "nowebgl" ? (
        <div data-testid="panorama-fallback" style={{ position: "absolute", inset: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl ?? panoramaUrl}
            alt={`Vista previa de ${scene.name}`}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          <div
            role="status"
            style={{ position: "absolute", left: 0, right: 0, top: 0, padding: "8px 12px", background: "rgba(11,15,20,.75)", color: "#fff", fontSize: 14 }}
          >
            Tu navegador no admite WebGL: se muestra una vista estática.
          </div>
          {fallbackNav.length > 0 ? (
            <nav
              aria-label="Navegación entre estancias"
              style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", flexWrap: "wrap", gap: 8, padding: 12, background: "rgba(11,15,20,.6)" }}
            >
              {fallbackNav.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  data-testid={`hotspot-${slugify(h.label)}`}
                  data-hotspot-id={h.id}
                  aria-label={`Ir a ${h.label}`}
                  onClick={() => h.targetSceneId && props.onNavigate(h.targetSceneId)}
                  style={{ minHeight: 44, padding: "0 16px", borderRadius: 9999, border: "1px solid #fff", background: "rgba(17,24,39,.8)", color: "#fff", cursor: "pointer" }}
                >
                  {h.label}
                </button>
              ))}
            </nav>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
