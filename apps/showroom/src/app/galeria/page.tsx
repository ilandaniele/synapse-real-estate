"use client";

import { useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { GalleryItem } from "@synapse/contracts";
import { EmptyState } from "@synapse/ui";
import { ManifestGate } from "@/components/ManifestGate";
import { Modal } from "@/components/Modal";

function Lightbox({ items, index, onIndex, onClose }: { items: GalleryItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const item = items[index];
  const prev = () => onIndex((index - 1 + items.length) % items.length);
  const next = () => onIndex((index + 1) % items.length);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    }
  };

  if (!item) return null;
  return (
    <Modal title={item.title} onClose={onClose} testId="lightbox" onKeyDown={onKeyDown} className="max-w-6xl">
      <div className="relative flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.imageUrl} alt={item.title} data-testid="lightbox-image" className="max-h-[70dvh] w-auto max-w-full rounded-md object-contain" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={prev}
          aria-label="Imagen anterior"
          data-testid="lightbox-prev"
          className="inline-flex size-11 items-center justify-center rounded-md border border-white/25 hover:bg-white/10"
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <p className="text-center text-sm text-white/80" aria-live="polite">
          {index + 1} / {items.length} · {item.credit}
        </p>
        <button
          type="button"
          onClick={next}
          aria-label="Imagen siguiente"
          data-testid="lightbox-next"
          className="inline-flex size-11 items-center justify-center rounded-md border border-white/25 hover:bg-white/10"
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </Modal>
  );
}

function Gallery({ items }: { items: GalleryItem[] }) {
  const [open, setOpen] = useState<number | null>(null);

  if (items.length === 0) {
    return <EmptyState title="Aún no hay imágenes en la galería" description="Vuelve pronto." />;
  }
  return (
    <>
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3" data-testid="gallery-grid">
        {items.map((g, i) => (
          <li key={g.id}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              data-testid={`gallery-item-${i}`}
              aria-label={`Ampliar: ${g.title}`}
              className="group block w-full overflow-hidden rounded-xl bg-white text-left shadow-sm"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.imageUrl} alt="" loading="lazy" className="aspect-[16/10] w-full object-cover transition-transform duration-300 group-hover:scale-105" />
              <span className="block p-3 text-sm font-medium">{g.title}</span>
            </button>
          </li>
        ))}
      </ul>
      {open !== null ? <Lightbox items={items} index={open} onIndex={setOpen} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

export default function GalleryPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 lg:px-8">
      <h1 className="mb-8 text-3xl font-semibold">Galería</h1>
      <ManifestGate>{({ gallery }) => <Gallery items={[...gallery].sort((a, b) => a.sortOrder - b.sortOrder)} />}</ManifestGate>
    </div>
  );
}
