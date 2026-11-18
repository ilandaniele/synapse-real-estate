"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker, Popup } from "maplibre-gl";
import type { Development, PointOfInterest } from "@synapse/contracts";
import { EmptyState, ErrorState, Spinner } from "@synapse/ui";
import { useI18n } from "@/i18n/I18nProvider";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const WORKER_URL = "/vendor/maplibre-gl-worker.mjs";
const LOAD_TIMEOUT_MS = 20_000;

type MapStatus = "loading" | "ready" | "error";
type Category = PointOfInterest["category"];

function markerElement(label: string, kind: "poi" | "dev", testId: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", label);
  el.setAttribute("data-testid", testId);
  // 44px hit area around a smaller visible dot.
  el.style.cssText = "width:44px;height:44px;padding:0;border:0;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;";
  const dot = document.createElement("span");
  dot.setAttribute("aria-hidden", "true");
  const size = kind === "dev" ? 26 : 18;
  dot.style.cssText = `display:block;width:${size}px;height:${size}px;border-radius:9999px;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.45);background:${kind === "dev" ? "#0b1220" : "#d9a93f"};`;
  el.appendChild(dot);
  return el;
}

export function LocationView({ development, pois }: { development: Development; pois: PointOfInterest[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const mlRef = useRef<typeof import("maplibre-gl") | null>(null);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const [category, setCategory] = useState<Category | "ALL">("ALL");
  const [selected, setSelected] = useState<string | null>(null);
  const { t } = useI18n();

  const indexed = useMemo(() => pois.map((poi, i) => ({ poi, i })), [pois]);
  const visible = useMemo(() => indexed.filter(({ poi }) => category === "ALL" || poi.category === category), [indexed, category]);
  const categories = useMemo(() => Array.from(new Set(pois.map((p) => p.category))), [pois]);

  // Create the map (client only; maplibre touches `window` on import).
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setStatus("loading");

    (async () => {
      try {
        const ml = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;
        mlRef.current = ml;
        // Bundlers break maplibre's own worker lookup; the file is copied to /public by `scripts/copy-maplibre-worker.mjs`.
        ml.setWorkerUrl(WORKER_URL);
        let loaded = false;
        const fail = () => {
          if (!loaded && !cancelled) setStatus("error");
        };
        const map = new ml.Map({
          container: containerRef.current,
          style: STYLE_URL,
          center: [development.lng, development.lat],
          zoom: 12.5,
          attributionControl: false,
        });
        mapRef.current = map;
        map.addControl(new ml.NavigationControl({ visualizePitch: true }), "top-right");
        map.on("load", () => {
          loaded = true;
          if (timer) clearTimeout(timer);
          if (!cancelled) setStatus("ready");
        });
        // Errors before `load` mean the style itself could not be fetched; later tile errors are non-fatal.
        map.on("error", fail);
        timer = setTimeout(fail, LOAD_TIMEOUT_MS);
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      popupRef.current?.remove();
      popupRef.current = null;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [development.lat, development.lng, attempt]);

  // Markers follow the category filter.
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (status !== "ready" || !map || !ml) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const devEl = markerElement(`${development.name}`, "dev", "map-development-marker");
    markersRef.current.push(new ml.Marker({ element: devEl }).setLngLat([development.lng, development.lat]).addTo(map));

    for (const { poi, i } of visible) {
      const el = markerElement(poi.name, "poi", `poi-marker-${i}`);
      el.addEventListener("click", () => setSelected(poi.id));
      markersRef.current.push(new ml.Marker({ element: el }).setLngLat([poi.lng, poi.lat]).addTo(map));
    }
  }, [status, visible, development.name, development.lat, development.lng]);

  // Selecting a POI (list or marker) recentres the map and labels it.
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    popupRef.current?.remove();
    popupRef.current = null;
    if (status !== "ready" || !map || !ml || !selected) return;
    const poi = pois.find((p) => p.id === selected);
    if (!poi) return;
    map.easeTo({ center: [poi.lng, poi.lat], duration: 600 });
    popupRef.current = new ml.Popup({ closeButton: false, offset: 22 })
      .setLngLat([poi.lng, poi.lat])
      .setText(poi.distanceText ? `${poi.name} · ${poi.distanceText}` : poi.name)
      .addTo(map);
  }, [selected, status, pois]);

  useEffect(() => {
    if (selected && !visible.some(({ poi }) => poi.id === selected)) setSelected(null);
  }, [visible, selected]);

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <section aria-labelledby="poi-heading" className="order-2 lg:order-1">
        <h2 id="poi-heading" className="text-xl font-semibold">
          {t.location.pois}
        </h2>
        {pois.length > 0 ? (
          <div role="group" aria-label={t.location.filterByCategory} className="mt-3 flex flex-wrap gap-2">
            {(["ALL", ...categories] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                data-testid={`poi-filter-${c}`}
                onClick={() => setCategory(c)}
                className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors ${
                  category === c ? "border-[#0b1220] bg-[#0b1220] text-white" : "border-slate-300 bg-white hover:bg-slate-100"
                }`}
              >
                {c === "ALL" ? t.location.all : t.poi[c]}
              </button>
            ))}
          </div>
        ) : null}

        {pois.length === 0 ? (
          <EmptyState title={t.location.empty} />
        ) : visible.length === 0 ? (
          <EmptyState title={t.location.emptyCategory} />
        ) : (
          <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0" data-testid="poi-list">
            {visible.map(({ poi, i }) => (
              <li key={poi.id}>
                <button
                  type="button"
                  data-testid={`poi-${i}`}
                  aria-pressed={selected === poi.id}
                  onClick={() => setSelected(poi.id)}
                  className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-4 py-2 text-left transition-colors ${
                    selected === poi.id ? "border-[#b8924a] bg-amber-50" : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <span>
                    <span className="block font-medium">{poi.name}</span>
                    <span className="text-xs text-slate-600">{t.poi[poi.category]}</span>
                  </span>
                  {poi.distanceText ? <span className="shrink-0 text-sm text-slate-700">{poi.distanceText}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="relative order-1 h-[60dvh] min-h-80 overflow-hidden rounded-xl bg-slate-200 shadow-sm lg:order-2 lg:h-[75dvh]">
        <div ref={containerRef} data-testid="map-container" data-status={status} aria-label={t.location.mapOf(development.name)} className="h-full w-full" />
        {status === "loading" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-700">
            <Spinner label={t.location.loadingMap} />
          </div>
        ) : null}
        {status === "error" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100/95 text-slate-800" data-testid="map-error">
            <ErrorState
              message={t.location.mapError}
              retryLabel={t.common.retry}
              onRetry={() => setAttempt((n) => n + 1)}
            />
          </div>
        ) : null}
        <p
          data-testid="map-attribution"
          className="absolute bottom-0 right-0 z-10 max-w-full rounded-tl-md bg-white/90 px-2 py-1 text-[11px] leading-tight text-slate-700"
        >
          <a href="https://openfreemap.org" target="_blank" rel="noreferrer" className="underline">
            OpenFreeMap
          </a>{" "}
          <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer" className="underline">
            © OpenMapTiles
          </a>{" "}
          · {t.location.data} ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">
            {t.location.osmContributors}
          </a>
          {t.location.osmLicenseNote}
        </p>
      </div>
    </div>
  );
}
