"use client";

const CSS = `
@keyframes syn-tour-spin { to { transform: rotate(360deg); } }
@keyframes syn-tour-pulse { 0% { transform: translate(-50%, -50%) scale(.6); opacity: .9; } 100% { transform: translate(-50%, -50%) scale(2.1); opacity: 0; } }
.syn-tour-spinner { display: inline-block; width: 36px; height: 36px; border-radius: 9999px; border: 3px solid rgba(255,255,255,.3); border-top-color: #fff; animation: syn-tour-spin .8s linear infinite; }
.syn-hs { width: 0; height: 0; }
.syn-hs-btn { position: absolute; left: -24px; top: -24px; width: 48px; height: 48px; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 9999px; border: 2px solid rgba(255,255,255,.92); background: rgba(17,24,39,.62); color: #fff; cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,.4); backdrop-filter: blur(4px); transition: transform .15s ease, background .15s ease; font: 700 20px/1 system-ui, sans-serif; }
.syn-hs-btn:hover { transform: scale(1.1); background: rgba(17,24,39,.85); }
.syn-hs-btn:focus-visible { outline: 3px solid #60a5fa; outline-offset: 3px; }
.syn-hs-btn[data-selected="true"] { border-color: #facc15; box-shadow: 0 0 0 5px rgba(250,204,21,.4); }
.syn-hs-btn[data-editable="true"] { cursor: grab; touch-action: none; }
.syn-hs-btn svg { width: 24px; height: 24px; }
.syn-hs-tip { position: absolute; left: 0; top: -52px; transform: translateX(calc(-50% + var(--syn-hs-shift, 0px))); white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity .15s ease; padding: 4px 10px; border-radius: 6px; background: rgba(17,24,39,.9); color: #fff; font: 600 13px/1.3 system-ui, sans-serif; }
.syn-hs:hover .syn-hs-tip, .syn-hs-btn:focus-visible + .syn-hs-tip, .syn-hs-btn[data-selected="true"] + .syn-hs-tip { opacity: 1; }
@media (pointer: coarse) { .syn-hs-tip { opacity: 1; } }
.syn-hs-pop { position: absolute; left: 0; top: 34px; transform: translateX(calc(-50% + var(--syn-hs-shift, 0px))); width: 220px; padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,.97); color: #111827; box-shadow: 0 6px 24px rgba(0,0,0,.35); font: 400 14px/1.4 system-ui, sans-serif; }
.syn-hs-pop[hidden] { display: none; }
.syn-hs-pop strong { display: block; margin-bottom: 4px; }
.syn-fp-ring { position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; border-radius: 9999px; border: 2px solid #2563eb; pointer-events: none; animation: syn-tour-pulse 1.6s ease-out infinite; }
@media (prefers-reduced-motion: reduce) { .syn-fp-ring { animation: none; opacity: .6; transform: translate(-50%, -50%) scale(1.4); } .syn-tour-spinner { animation-duration: 2.4s; } }
`;

/** Hoisted and de-duplicated by React 19 (`href` + `precedence`); no CSS file needed by consumers. */
export function TourStyles() {
  return (
    <style href="synapse-tour-engine" precedence="default">
      {CSS}
    </style>
  );
}
