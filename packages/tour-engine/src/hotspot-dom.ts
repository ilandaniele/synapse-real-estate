import type { Hotspot } from "@synapse/contracts";
import { exceedsDragThreshold, slugify } from "./geometry";
import type { TourStrings } from "./strings";

export interface HotspotViewState {
  selected: boolean;
  editable: boolean;
  strings: TourStrings;
}

export interface HotspotCallbacks {
  /** Non-editable NAVIGATION click / Enter. */
  onActivate(hotspot: Hotspot): void;
  /** Editable click / Enter. */
  onSelect(hotspot: Hotspot): void;
  /** Editable drag: pointer position in client coordinates. */
  onDragTo(hotspot: Hotspot, clientX: number, clientY: number): void;
}

export interface HotspotHandle {
  /** Root element handed to Marzipano (`hotspotContainer().createHotspot`). */
  element: HTMLElement;
  update(hotspot: Hotspot, state: HotspotViewState): void;
  destroy(): void;
}

// Static trusted markup (no user input).
const ARROW_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V6"/><path d="M6 11l6-6 6 6"/></svg>';

const STOP_PROPAGATION = ["pointerdown", "mousedown", "touchstart", "dblclick"] as const;
const DRAG_START_PX = 4;

let popoverSeq = 0;

/**
 * Builds the DOM for one hotspot imperatively. Marzipano owns the positioning of the root element
 * (it lives outside React's tree), so the buttons here are plain DOM with the same a11y contract
 * as React ones: real `<button>`, aria-label, >=44px, Enter/Space activate via native `click`.
 */
export function createHotspotHandle(
  hotspot: Hotspot,
  state: HotspotViewState,
  callbacks: HotspotCallbacks,
): HotspotHandle {
  let current = hotspot;
  let view = state;

  const root = document.createElement("div");
  root.className = "syn-hs";
  root.setAttribute("data-hotspot-root", "");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "syn-hs-btn";

  const tip = document.createElement("span");
  tip.className = "syn-hs-tip";
  tip.setAttribute("aria-hidden", "true");

  const popover = document.createElement("div");
  popover.className = "syn-hs-pop";
  popover.hidden = true;
  popover.id = `syn-hs-pop-${++popoverSeq}`;
  popover.setAttribute("role", "note");

  root.append(button, tip, popover);

  const setPopoverOpen = (open: boolean) => {
    popover.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  };

  const render = () => {
    const isInfo = current.type === "INFO";
    button.setAttribute("data-testid", `hotspot-${slugify(current.label)}`);
    button.setAttribute("data-hotspot-id", current.id);
    button.setAttribute("data-hotspot-type", current.type);
    button.setAttribute("data-selected", String(view.selected));
    button.setAttribute("data-editable", String(view.editable));
    button.setAttribute("aria-label", isInfo ? view.strings.info(current.label) : view.strings.goTo(current.label));
    if (isInfo) {
      button.textContent = "i";
      button.setAttribute("aria-controls", popover.id);
      if (!button.hasAttribute("aria-expanded")) button.setAttribute("aria-expanded", "false");
      popover.replaceChildren();
      const title = document.createElement("strong");
      title.textContent = current.label;
      const body = document.createElement("span");
      body.textContent = current.description ?? "";
      popover.append(title, body);
    } else {
      button.innerHTML = ARROW_ICON;
      button.removeAttribute("aria-controls");
      button.removeAttribute("aria-expanded");
      setPopoverOpen(false);
    }
    tip.textContent = current.label;
  };

  // Keep Marzipano's drag/pinch controls from starting when the user presses a hotspot.
  const stop = (e: Event) => e.stopPropagation();
  for (const type of STOP_PROPAGATION) root.addEventListener(type, stop);

  let drag: { pointerId: number; startX: number; startY: number; moved: boolean } | null = null;
  let suppressClick = false;

  const onPointerDown = (e: PointerEvent) => {
    suppressClick = false;
    if (!view.editable || e.button !== 0) return;
    drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false };
    button.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (!drag.moved && !exceedsDragThreshold(e.clientX - drag.startX, e.clientY - drag.startY, DRAG_START_PX)) return;
    drag.moved = true;
    callbacks.onDragTo(current, e.clientX, e.clientY);
  };
  const endDrag = (e: PointerEvent) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    suppressClick = drag.moved;
    drag = null;
    if (button.hasPointerCapture(e.pointerId)) button.releasePointerCapture(e.pointerId);
  };
  const onClick = () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (view.editable) {
      callbacks.onSelect(current);
    } else if (current.type === "INFO") {
      setPopoverOpen(popover.hidden);
    } else {
      callbacks.onActivate(current);
    }
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !popover.hidden) {
      setPopoverOpen(false);
      button.focus();
    }
  };
  const onFocusOut = (e: FocusEvent) => {
    if (!popover.hidden && !(e.relatedTarget instanceof Node && root.contains(e.relatedTarget))) setPopoverOpen(false);
  };

  button.addEventListener("pointerdown", onPointerDown);
  button.addEventListener("pointermove", onPointerMove);
  button.addEventListener("pointerup", endDrag);
  button.addEventListener("pointercancel", endDrag);
  button.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeyDown);
  root.addEventListener("focusout", onFocusOut);

  render();

  return {
    element: root,
    update(next, nextState) {
      current = next;
      view = nextState;
      render();
    },
    destroy() {
      for (const type of STOP_PROPAGATION) root.removeEventListener(type, stop);
      button.removeEventListener("pointerdown", onPointerDown);
      button.removeEventListener("pointermove", onPointerMove);
      button.removeEventListener("pointerup", endDrag);
      button.removeEventListener("pointercancel", endDrag);
      button.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("focusout", onFocusOut);
    },
  };
}
