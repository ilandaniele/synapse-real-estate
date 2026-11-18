"use client";

import { useEffect, useRef } from "react";
import type { Scene } from "@synapse/contracts";
import { DEFAULT_LOCALE, type Locale } from "@synapse/domain";
import { slugify } from "./geometry";
import { TOUR_STRINGS } from "./strings";

export interface SceneStripProps {
  scenes: Scene[];
  currentSceneId: string;
  onSelect: (sceneId: string) => void;
  className?: string;
  locale?: Locale;
}

/** Horizontally scrollable thumbnail strip (bottom bar of a tour). */
export function SceneStrip({ scenes, currentSceneId, onSelect, className, locale = DEFAULT_LOCALE }: SceneStripProps) {
  const currentRef = useRef<HTMLButtonElement>(null);
  const sorted = [...scenes].sort((a, b) => a.sortOrder - b.sortOrder);

  useEffect(() => {
    currentRef.current?.scrollIntoView?.({ inline: "center", block: "nearest" });
  }, [currentSceneId]);

  if (sorted.length === 0) return null;

  return (
    <ul
      aria-label={TOUR_STRINGS[locale].strip}
      data-testid="scene-strip"
      className={className}
      style={{ listStyle: "none", margin: 0, padding: 8, display: "flex", gap: 8, overflowX: "auto", WebkitOverflowScrolling: "touch" }}
    >
      {sorted.map((scene) => {
        const current = scene.id === currentSceneId;
        return (
          <li key={scene.id} style={{ flex: "0 0 auto" }}>
            <button
              ref={current ? currentRef : undefined}
              type="button"
              data-testid={`scene-thumb-${slugify(scene.slug || scene.name)}`}
              aria-label={scene.name}
              aria-current={current ? "true" : undefined}
              onClick={() => onSelect(scene.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                minWidth: 96,
                minHeight: 44,
                padding: 4,
                borderRadius: 8,
                border: current ? "2px solid #2563eb" : "2px solid transparent",
                background: current ? "rgba(37,99,235,.18)" : "rgba(17,24,39,.55)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              {scene.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={scene.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  style={{ width: 96, height: 54, objectFit: "cover", borderRadius: 4, display: "block" }}
                />
              ) : (
                <span aria-hidden="true" style={{ width: 96, height: 54, borderRadius: 4, background: "#334155", display: "block" }} />
              )}
              <span style={{ fontSize: 12, lineHeight: 1.2 }}>{scene.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
