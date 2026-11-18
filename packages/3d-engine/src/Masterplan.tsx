"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, useProgress } from "@react-three/drei";
import type { Unit } from "@synapse/contracts";
import { DEFAULT_LOCALE, type Locale } from "@synapse/domain";
import type { CameraPreset } from "./helpers";
import { MasterplanErrorBoundary } from "./MasterplanErrorBoundary";
import { MasterplanModel } from "./MasterplanModel";
import { MasterplanStyles } from "./MasterplanStyles";
import { MASTERPLAN_STRINGS, type MasterplanStrings } from "./strings";
import { UnitList } from "./UnitList";
import { hasWebGL } from "./webgl";

export interface MasterplanProps {
  /** URL of the masterplan GLB (same-origin or CORS-enabled). */
  modelUrl: string;
  units: Unit[];
  selectedUnitId: string | null;
  hoveredUnitId: string | null;
  /** `null` = click on empty space / terrain. */
  onSelect: (unitId: string | null) => void;
  onHover: (unitId: string | null) => void;
  /** Units for which this returns `false` fade to 35% opacity. */
  filterMatch?: (unitId: string) => boolean;
  /** Sizing is up to the consumer; without a className the component fills its parent. */
  className?: string;
  showLabels?: boolean;
  cameraPreset?: CameraPreset;
  locale?: Locale;
}

type GlSupport = "unknown" | "yes" | "no";

function LoadingOverlay({ strings }: { strings: MasterplanStrings }) {
  const { progress } = useProgress();
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="masterplan-loading"
      style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "#0f172a", pointerEvents: "none" }}
    >
      <span className="syn-mp-spinner" aria-hidden="true" />
      <span style={{ font: "600 14px system-ui, sans-serif" }}>{strings.loading(Math.round(progress))}</span>
    </div>
  );
}

export function Masterplan({
  modelUrl,
  units,
  selectedUnitId,
  hoveredUnitId,
  onSelect,
  onHover,
  filterMatch,
  className,
  showLabels = true,
  cameraPreset = "overview",
  locale = DEFAULT_LOCALE,
}: MasterplanProps) {
  const strings = MASTERPLAN_STRINGS[locale];
  const [gl, setGl] = useState<GlSupport>("unknown");
  const [ready, setReady] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const selectedRef = useRef(selectedUnitId);
  selectedRef.current = selectedUnitId;

  useEffect(() => {
    setGl(hasWebGL() ? "yes" : "no");
  }, []);

  const handleReady = useCallback(() => setReady(true), []);
  const handleRetry = useCallback(() => {
    useGLTF.clear(modelUrl);
    setReady(false);
    setRetryKey((n) => n + 1);
  }, [modelUrl]);

  // A different model starts from the loading state again.
  useEffect(() => {
    setReady(false);
  }, [modelUrl]);

  return (
    <div
      className={className}
      data-testid="masterplan-canvas"
      data-selected-unit={selectedUnitId ?? ""}
      data-hovered-unit={hoveredUnitId ?? ""}
      style={{
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(180deg, #9ecbf5 0%, #cfe6fa 45%, #f1ede1 100%)",
        ...(className ? null : { width: "100%", height: "100%" }),
      }}
    >
      <MasterplanStyles />

      {gl === "yes" ? (
        <MasterplanErrorBoundary key={retryKey} onRetry={handleRetry} strings={strings}>
          <Canvas
            dpr={[1, 2]}
            shadows
            frameloop="demand"
            camera={{ fov: 45, near: 0.5, far: 5000, position: [60, 60, 60] }}
            gl={{ antialias: true, alpha: true }}
            style={{ position: "absolute", inset: 0 }}
            onPointerMissed={() => {
              if (selectedRef.current !== null) onSelect(null);
            }}
          >
            <Suspense fallback={null}>
              <MasterplanModel
                modelUrl={modelUrl}
                units={units}
                selectedUnitId={selectedUnitId}
                hoveredUnitId={hoveredUnitId}
                onSelect={onSelect}
                onHover={onHover}
                filterMatch={filterMatch}
                showLabels={showLabels}
                cameraPreset={cameraPreset}
                onReady={handleReady}
                locale={locale}
              />
            </Suspense>
          </Canvas>
          {ready ? null : <LoadingOverlay strings={strings} />}
        </MasterplanErrorBoundary>
      ) : null}

      {gl === "no" ? (
        <div role="status" data-testid="masterplan-nowebgl" style={{ position: "absolute", left: 0, right: 0, top: 0, padding: 16, color: "#0f172a", font: "600 14px system-ui, sans-serif" }}>
          {strings.noWebGL}
        </div>
      ) : null}

      <div style={gl === "no" ? { position: "absolute", left: 0, right: 0, top: 56 } : undefined}>
        <UnitList units={units} selectedUnitId={selectedUnitId} onSelect={onSelect} onHover={onHover} visible={gl === "no"} locale={locale} />
      </div>
    </div>
  );
}
