"use client";

import { Environment, Lightformer } from "@react-three/drei";

/** Daylight built from local light cards: soft fill and glass reflections without fetching an HDR. */
export function SkyLighting() {
  return (
    <>
      <hemisphereLight args={["#e0ecff", "#9a8a6c", 0.55]} />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={1.6} color="#dbe8ff" scale={[60, 60, 1]} position={[0, 30, 0]} rotation-x={Math.PI / 2} />
        <Lightformer form="rect" intensity={2.4} color="#fff1d6" scale={[30, 12, 1]} position={[30, 12, 20]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.8} color="#c9d8f0" scale={[40, 10, 1]} position={[-30, 8, -20]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.5} color="#b8a888" scale={[80, 80, 1]} position={[0, -10, 0]} rotation-x={-Math.PI / 2} />
      </Environment>
    </>
  );
}
