"use client";

const CSS = `
@keyframes syn-ui-spin { to { transform: rotate(360deg); } }
.syn-ui-spinner { display: inline-block; border-radius: 9999px; border: 3px solid rgba(148,163,184,.4); border-top-color: currentColor; animation: syn-ui-spin .8s linear infinite; }
@media (prefers-reduced-motion: reduce) { .syn-ui-spinner { animation-duration: 2.4s; } }
`;

/** Hoisted and de-duplicated by React 19 (`href` + `precedence`). */
export function UiStyles() {
  return (
    <style href="synapse-ui" precedence="default">
      {CSS}
    </style>
  );
}
