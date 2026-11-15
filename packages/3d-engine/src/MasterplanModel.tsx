"use client";

import { useEffect, useMemo, useRef } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { Line, useGLTF } from "@react-three/drei";
import type { Unit } from "@synapse/contracts";
import { STATUS_META, buildMeshIndex } from "@synapse/domain";
import { CameraRig } from "./CameraRig";
import {
  computeUnitVisual,
  defaultLabelPosition,
  filterOpacity,
  isDragGesture,
  pickUnitFromHits,
  type CameraPreset,
  type ObjectLike,
  type Vec3,
} from "./helpers";
import { applyUnitVisual, prepareModel } from "./scene-prep";
import { UnitLabel } from "./UnitLabel";

export interface MasterplanModelProps {
  modelUrl: string;
  units: Unit[];
  selectedUnitId: string | null;
  hoveredUnitId: string | null;
  onSelect: (unitId: string | null) => void;
  onHover: (unitId: string | null) => void;
  filterMatch?: (unitId: string) => boolean;
  showLabels: boolean;
  cameraPreset: CameraPreset;
  onReady: () => void;
}

/** Everything that lives inside the R3F canvas: model, picking, highlight, labels, lights, camera. */
export function MasterplanModel({
  modelUrl,
  units,
  selectedUnitId,
  hoveredUnitId,
  onSelect,
  onHover,
  filterMatch,
  showLabels,
  cameraPreset,
  onReady,
}: MasterplanModelProps) {
  // Draco decoders live on a CDN by default; the showroom must not fetch anything remote.
  const gltf = useGLTF(modelUrl, false);
  const invalidate = useThree((s) => s.invalidate);
  const dom = useThree((s) => s.gl.domElement);

  // Consumers usually pass a fresh `units` array on every render: key the heavy work on content.
  const unitsRef = useRef(units);
  unitsRef.current = units;
  const meshKey = units.map((u) => `${u.id}:${u.meshNames.join("|")}`).join(";");
  const statusKey = units.map((u) => `${u.id}:${u.status}`).join(";");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const prepared = useMemo(() => prepareModel(gltf.scene, unitsRef.current), [gltf.scene, meshKey]);
  useEffect(() => () => prepared.dispose(), [prepared]);
  useEffect(() => {
    onReady();
    invalidate();
  }, [prepared, onReady, invalidate]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const meshIndex = useMemo(() => buildMeshIndex(unitsRef.current.map((u) => ({ unitId: u.id, meshNames: u.meshNames }))), [meshKey]);

  // Status tint + selected/hovered highlight + filter fade. Mutates only cloned materials.
  useEffect(() => {
    for (const unit of units) {
      const node = prepared.units.get(unit.id);
      if (!node) continue;
      const visual = computeUnitVisual({
        selected: unit.id === selectedUnitId,
        hovered: unit.id === hoveredUnitId,
        filterOpacity: filterOpacity(unit.id, filterMatch),
      });
      applyUnitVisual(node, unit.status, visual, prepared.base);
    }
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepared, statusKey, selectedUnitId, hoveredUnitId, filterMatch, invalidate]);

  useEffect(() => {
    dom.style.cursor = hoveredUnitId ? "pointer" : "";
    return () => {
      dom.style.cursor = "";
    };
  }, [dom, hoveredUnitId]);

  const lastHover = useRef<string | null>(null);
  useEffect(() => {
    lastHover.current = hoveredUnitId;
  }, [hoveredUnitId]);

  const unitFromEvent = (e: ThreeEvent<MouseEvent | PointerEvent>): string | null =>
    pickUnitFromHits(e.intersections as ReadonlyArray<{ object: ObjectLike }>, meshIndex);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (isDragGesture(e.delta)) return;
    e.stopPropagation();
    onSelect(unitFromEvent(e));
  };
  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const id = unitFromEvent(e);
    if (id !== lastHover.current) {
      lastHover.current = id;
      onHover(id);
    }
  };
  const handleOut = () => {
    if (lastHover.current !== null) {
      lastHover.current = null;
      onHover(null);
    }
  };

  const { bounds } = prepared;
  const reach = Math.max(
    Math.abs(bounds.min[0]),
    Math.abs(bounds.max[0]),
    Math.abs(bounds.min[2]),
    Math.abs(bounds.max[2]),
  ) * 1.2;
  const sunHeight = Math.max(reach * 1.1, 20);
  const selectedNode = selectedUnitId ? prepared.units.get(selectedUnitId) : undefined;
  const selectedUnit = selectedUnitId ? units.find((u) => u.id === selectedUnitId) : undefined;

  const outline = useMemo(() => {
    if (!selectedNode) return null;
    const { min, max } = selectedNode.box;
    const pad = Math.max(max[0] - min[0], max[2] - min[2]) * 0.03;
    const y = min[1] + 0.2;
    return [
      [min[0] - pad, y, min[2] - pad],
      [max[0] + pad, y, min[2] - pad],
      [max[0] + pad, y, max[2] + pad],
      [min[0] - pad, y, max[2] + pad],
      [min[0] - pad, y, min[2] - pad],
    ] as [number, number, number][];
  }, [selectedNode]);

  return (
    <>
      <hemisphereLight args={["#dbeafe", "#8b7f68", 1.0]} />
      <directionalLight
        castShadow
        intensity={2.4}
        position={[reach * 0.7, sunHeight, reach * 0.5]}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-reach}
        shadow-camera-right={reach}
        shadow-camera-top={reach}
        shadow-camera-bottom={-reach}
        shadow-camera-near={1}
        shadow-camera-far={reach * 4}
        shadow-bias={-0.0004}
      />

      <primitive object={prepared.root} onClick={handleClick} onPointerMove={handleMove} onPointerOut={handleOut} />

      {outline && selectedUnit ? (
        <Line
          points={outline}
          color={STATUS_META[selectedUnit.status].color}
          lineWidth={4}
          depthTest={false}
          renderOrder={10}
        />
      ) : null}

      {showLabels
        ? units.map((unit) => {
            const node = prepared.units.get(unit.id);
            const position: Vec3 | null = unit.labelPosition ?? (node ? defaultLabelPosition(node.box) : null);
            if (!position) return null;
            return (
              <UnitLabel
                key={unit.id}
                unit={unit}
                position={position}
                selected={unit.id === selectedUnitId}
                faded={filterOpacity(unit.id, filterMatch) < 1}
                onSelect={onSelect}
                onHover={onHover}
              />
            );
          })
        : null}

      <CameraRig overall={bounds} focus={selectedNode ? selectedNode.box : null} preset={cameraPreset} />
    </>
  );
}
