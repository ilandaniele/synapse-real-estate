"use client";

const CSS = `
@keyframes syn-mp-spin { to { transform: rotate(360deg); } }
.syn-mp-spinner { display: inline-block; width: 40px; height: 40px; border-radius: 9999px; border: 3px solid rgba(15,23,42,.2); border-top-color: #0f172a; animation: syn-mp-spin .8s linear infinite; }
.syn-mp-label { position: relative; display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; min-height: 30px; border-radius: 9999px; border: 2px solid rgba(255,255,255,.9); background: rgba(15,23,42,.82); color: #fff; font: 600 13px/1 system-ui, sans-serif; white-space: nowrap; cursor: pointer; backdrop-filter: blur(3px); transition: transform .12s ease; }
.syn-mp-label::after { content: ""; position: absolute; inset: -8px; }
.syn-mp-label:hover { transform: scale(1.06); }
.syn-mp-label:focus-visible { outline: 3px solid #60a5fa; outline-offset: 2px; }
.syn-mp-anchor { display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%); }
.syn-mp-stem { width: 2px; height: 22px; background: rgba(255,255,255,.85); box-shadow: 0 1px 3px rgba(0,0,0,.35); }
.syn-mp-dot { width: 9px; height: 9px; border-radius: 9999px; border: 1px solid rgba(255,255,255,.8); flex: none; }
@media (max-width: 640px) { .syn-mp-label { font-size: 11px; padding: 2px 7px; min-height: 24px; gap: 4px; } .syn-mp-dot { width: 7px; height: 7px; } .syn-mp-stem { height: 14px; } }
@media (prefers-reduced-motion: reduce) { .syn-mp-spinner { animation-duration: 2.4s; } .syn-mp-label { transition: none; } }
`;

/** Hoisted and de-duplicated by React 19 (`href` + `precedence`); no CSS file needed by consumers. */
export function MasterplanStyles() {
  return (
    <style href="synapse-3d-engine" precedence="default">
      {CSS}
    </style>
  );
}
