"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Expand, Map as MapIcon, Shrink } from "lucide-react";
import type { DevelopmentManifest, Scene } from "@synapse/contracts";
import { EmptyState } from "@synapse/ui";
import { FloorPlanMap, PanoramaViewer, SceneStrip, useTour } from "@synapse/tour-engine";
import { useI18n } from "@/i18n/I18nProvider";
import { trackVisit } from "@/lib/analytics";
import { scenesForUnit } from "@/lib/manifest";
import { useShowroomStore } from "@/lib/store";
import { ManifestGate } from "./ManifestGate";
import { Modal } from "./Modal";

const GLASS_BTN =
  "pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 bg-[#0b1220]/70 px-4 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-[#0b1220]/90";

interface PlayerProps {
  unitName: string;
  unitCode: string;
  scenes: Scene[];
  initialSceneSlug: string | undefined;
  plan: DevelopmentManifest["floorPlans"][number] | null;
}

function TourPlayer({ unitName, unitCode, scenes, initialSceneSlug, plan }: PlayerProps) {
  const router = useRouter();
  const selectUnit = useShowroomStore((s) => s.selectUnit);
  const { current, goTo } = useTour(scenes, initialSceneSlug);
  const { locale, t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  /** iOS Safari has no element fullscreen: fall back to a viewport-filling layout. */
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);

  // Keep the unit selected so "back" lands on the masterplan with it highlighted.
  useEffect(() => {
    selectUnit(unitCode);
  }, [unitCode, selectUnit]);

  // `?scene=<slug>` deep link follows the current room (replace: scene hops must not pile up history).
  const currentSlug = current?.slug;
  const currentId = current?.id;
  useEffect(() => {
    if (currentId) trackVisit("SCENE", currentId);
  }, [currentId]);
  useEffect(() => {
    if (!currentSlug) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("scene") === currentSlug) return;
    url.searchParams.set("scene", currentSlug);
    window.history.replaceState(window.history.state, "", url);
  }, [currentSlug]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!pseudoFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !planOpen) setPseudoFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pseudoFullscreen, planOpen]);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    if (pseudoFullscreen) {
      setPseudoFullscreen(false);
      return;
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (typeof el.requestFullscreen === "function") {
      try {
        await el.requestFullscreen();
        return;
      } catch {
        // Denied or unsupported: use the CSS fallback below.
      }
    }
    setPseudoFullscreen(true);
  }, [pseudoFullscreen]);

  const goBack = () => router.push("/masterplan");

  if (!current) {
    return (
      <div className="mx-auto max-w-md py-16">
        <EmptyState title={t.tour.noScenes} />
      </div>
    );
  }

  const isFs = fullscreen || pseudoFullscreen;

  return (
    <div
      ref={containerRef}
      data-testid="tour-root"
      data-fullscreen={isFs ? "true" : "false"}
      className={`bg-black ${pseudoFullscreen ? "fixed inset-0 z-50" : "relative h-[calc(100dvh-3.5rem)] w-full"} overflow-hidden`}
    >
      <PanoramaViewer
        className="absolute inset-0 h-full w-full"
        scene={current}
        hotspots={current.hotspots}
        onNavigate={goTo}
        locale={locale}
      />

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={goBack} data-testid="tour-back" className={GLASS_BTN}>
              <ArrowLeft aria-hidden="true" size={16} /> {t.tour.back}
            </button>
            <div className="pointer-events-auto rounded-full bg-[#0b1220]/70 px-4 py-2 text-sm text-white backdrop-blur">
              <span className="text-white/70">{unitName} · </span>
              <span className="font-semibold" data-testid="tour-scene-name" aria-live="polite">
                {current.name}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {plan ? (
              <button
                type="button"
                onClick={() => setPlanOpen(true)}
                aria-haspopup="dialog"
                data-testid="tour-floorplan-button"
                className={GLASS_BTN}
              >
                <MapIcon aria-hidden="true" size={16} /> {t.tour.plan}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              aria-pressed={isFs}
              aria-label={isFs ? t.tour.exitFullscreen : t.tour.enterFullscreen}
              data-testid="tour-fullscreen"
              className={GLASS_BTN}
            >
              {isFs ? <Shrink aria-hidden="true" size={16} /> : <Expand aria-hidden="true" size={16} />}
              <span className="hidden sm:inline">{isFs ? t.tour.exitShort : t.tour.enterFullscreen}</span>
            </button>
          </div>
        </div>

        <div className="mb-[7.5rem] flex flex-col gap-2 md:mb-0">
          <nav
            aria-label={t.tour.rooms}
            data-testid="tour-rooms"
            className="pointer-events-auto flex gap-2 overflow-x-auto md:absolute md:left-4 md:top-24 md:flex-col md:overflow-visible"
          >
            {scenes.map((s) => (
              <button
                key={s.id}
                type="button"
                data-testid={`tour-room-${s.slug}`}
                aria-current={s.id === current.id ? "true" : undefined}
                onClick={() => goTo(s.id)}
                className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium backdrop-blur transition-colors ${
                  s.id === current.id
                    ? "border-[#d9b46a] bg-[#d9b46a] text-[#0b1220]"
                    : "border-white/25 bg-[#0b1220]/70 text-white hover:bg-[#0b1220]/90"
                }`}
              >
                {s.name}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-2 sm:bottom-3">
        <SceneStrip
          className="pointer-events-auto max-w-full rounded-xl bg-[#0b1220]/70 backdrop-blur"
          scenes={scenes}
          currentSceneId={current.id}
          onSelect={goTo}
          locale={locale}
        />
      </div>

      {planOpen && plan ? (
        <Modal title={t.tour.goToPoint} onClose={() => setPlanOpen(false)} testId="floorplan-modal" className="max-w-3xl">
          <div className="rounded-lg bg-white p-2 text-slate-900">
            <FloorPlanMap
              plan={plan}
              scenes={scenes}
              currentSceneId={current.id}
              onSelect={(id) => {
                goTo(id);
                setPlanOpen(false);
              }}
              locale={locale}
            />
          </div>
          <p className="mt-3 text-sm text-white/70">{t.tour.planHint}</p>
        </Modal>
      ) : null}
    </div>
  );
}

function TourLoader({ manifest, slug }: { manifest: DevelopmentManifest; slug: string }) {
  const unit = manifest.units.find((u) => u.slug === slug);
  // Read once the manifest is in (client only), so the SSR pass never touches `window`.
  const { t } = useI18n();
  const [initialSceneSlug] = useState(() => new URLSearchParams(window.location.search).get("scene") ?? undefined);

  if (!unit) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <EmptyState
          title={t.common.unitNotFound}
          action={
            <Link href="/unidades" className="inline-flex min-h-11 items-center rounded-md border border-slate-400 px-4 text-sm">
              {t.tour.viewUnits}
            </Link>
          }
        />
      </div>
    );
  }
  const scenes = scenesForUnit(manifest.scenes, unit.id);
  if (scenes.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <EmptyState
          title={t.tour.noTour(unit.name)}
          description={t.tour.noTourText}
          action={
            <Link href={`/unidades/${unit.slug}`} className="inline-flex min-h-11 items-center rounded-md border border-slate-400 px-4 text-sm">
              {t.common.viewSheet}
            </Link>
          }
        />
      </div>
    );
  }
  const plan = manifest.floorPlans.find((p) => p.unitId === unit.id) ?? null;
  return (
    <TourPlayer
      unitName={unit.name}
      unitCode={unit.code}
      scenes={scenes}
      initialSceneSlug={initialSceneSlug}
      plan={plan}
    />
  );
}

export function TourRoute({ slug }: { slug: string }) {
  return <ManifestGate>{(manifest) => <TourLoader manifest={manifest} slug={slug} />}</ManifestGate>;
}
