"use client";

import { useEffect, useRef, type ElementRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { PerspectiveCamera, Vector3 } from "three";
import {
  computeCameraGoal,
  framingDistance,
  boxSize,
  presetDirection,
  type BoxLike,
  type CameraPreset,
  type Vec3,
} from "./helpers";

export interface CameraRigProps {
  /** Whole model; used for the overview framing and orbit limits. */
  overall: BoxLike;
  /** Selected villa box, or `null` to frame the whole model. */
  focus: BoxLike | null;
  preset: CameraPreset;
}

const FLY_RATE = 6;

/** OrbitControls + smooth fly-to for demand-rendered canvases. */
export function CameraRig({ overall, focus, preset }: CameraRigProps) {
  const controlsRef = useRef<ElementRef<typeof OrbitControls>>(null);
  const goal = useRef<{ target: Vector3; position: Vector3 } | null>(null);
  const initialized = useRef(false);
  const lastPreset = useRef<CameraPreset>(preset);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const viewport = useThree((s) => s.size);
  // Read through a ref so a resize (e.g. the mobile address bar) never re-frames the camera on its own.
  const aspectRef = useRef(1);
  aspectRef.current = viewport.height > 0 ? viewport.width / viewport.height : 1;

  const fov = camera instanceof PerspectiveCamera ? camera.fov : 45;
  const overallDistance = framingDistance(boxSize(overall), fov, 1, aspectRef.current);
  const focusSize = focus ? boxSize(focus) : null;
  const minDistance = Math.max(2, (focusSize ? Math.max(...focusSize) : Math.max(...boxSize(overall))) * 0.15);

  const framingKey = boxesKey(focus, overall);

  // Compute a new goal when the selection, preset or model changes.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const presetChanged = lastPreset.current !== preset;
    lastPreset.current = preset;
    const current = camera.position.clone().sub(controls.target);
    const keepDirection = initialized.current && !presetChanged && current.lengthSq() > 1e-6;
    const direction: Vec3 = keepDirection ? [current.x, Math.max(current.y, 0.2 * current.length()), current.z] : presetDirection(preset);

    const next = computeCameraGoal({
      box: focus ?? overall,
      fovDeg: fov,
      direction,
      padding: focus ? 1.9 : 1.05,
      minDistance: focus ? minDistance * 1.5 : 0,
      aspect: aspectRef.current,
    });
    const target = new Vector3(...next.target);
    const position = new Vector3(...next.position);

    if (!initialized.current) {
      initialized.current = true;
      camera.position.copy(position);
      controls.target.copy(target);
      controls.update();
    } else {
      goal.current = { target, position };
    }
    invalidate();
  }, [camera, framingKey, preset, fov, invalidate, minDistance]); // eslint-disable-line react-hooks/exhaustive-deps

  // Any manual interaction cancels the fly-to so the user is never fought by the camera.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const cancel = () => {
      goal.current = null;
    };
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, []);

  useFrame((_, delta) => {
    const g = goal.current;
    const controls = controlsRef.current;
    if (!g || !controls) return;
    const k = 1 - Math.exp(-delta * FLY_RATE);
    camera.position.lerp(g.position, k);
    controls.target.lerp(g.target, k);
    controls.update();
    const eps = Math.max(0.01, overallDistance * 1e-4);
    if (camera.position.distanceTo(g.position) < eps && controls.target.distanceTo(g.target) < eps) {
      goal.current = null;
    } else {
      invalidate();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={minDistance}
      maxDistance={overallDistance * 1.8}
      minPolarAngle={0.05}
      maxPolarAngle={Math.PI / 2 - 0.04}
      screenSpacePanning={false}
    />
  );
}

/** Stable dependency key for boxes (their object identity changes on every render). */
function boxesKey(focus: BoxLike | null, overall: BoxLike): string {
  const f = focus ? [...focus.min, ...focus.max].join(",") : "none";
  return `${f}|${[...overall.min, ...overall.max].join(",")}`;
}
