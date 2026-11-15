"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { useManifest } from "@/lib/query";

const NAV = [
  { slug: "inicio", href: "/", label: "Inicio" },
  { slug: "masterplan", href: "/masterplan", label: "Masterplan" },
  { slug: "areas", href: "/areas", label: "Áreas" },
  { slug: "unidades", href: "/unidades", label: "Unidades" },
  { slug: "galeria", href: "/galeria", label: "Galería" },
  { slug: "ubicacion", href: "/ubicacion", label: "Ubicación" },
  { slug: "contacto", href: "/contacto", label: "Contacto" },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { data } = useManifest();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // The development name comes from the manifest, so the tab title is set client-side.
  useEffect(() => {
    if (!data) return;
    const section = NAV.find((n) => isActive(pathname, n.href) && n.href !== "/")?.label;
    document.title = section ? `${section} · ${data.development.name}` : data.development.name;
  }, [data, pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-white/10 bg-[#0b1220]/90 text-white backdrop-blur">
      <div className="mx-auto flex h-full max-w-[1920px] items-center justify-between gap-4 px-4 lg:px-8">
        <Link href="/" className="flex min-h-11 items-center gap-2 rounded-md font-semibold tracking-wide" data-testid="site-name">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-[#d9b46a]" />
          <span className="truncate">{data?.development.name ?? "Showroom"}</span>
        </Link>

        <button
          type="button"
          className="inline-flex size-11 items-center justify-center rounded-md border border-white/20 md:hidden"
          aria-expanded={open}
          aria-controls="site-nav"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          data-testid="nav-toggle"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X aria-hidden="true" size={22} /> : <Menu aria-hidden="true" size={22} />}
        </button>

        <nav
          id="site-nav"
          aria-label="Principal"
          className={
            open
              ? "absolute inset-x-0 top-14 flex flex-col gap-1 border-b border-white/10 bg-[#0b1220] p-3 shadow-xl md:static md:flex-row md:border-0 md:bg-transparent md:p-0 md:shadow-none"
              : "hidden md:flex md:items-center md:gap-1"
          }
        >
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.slug}
                href={item.href}
                data-testid={`nav-${item.slug}`}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors ${
                  active ? "bg-white/15 text-[#f0d79a]" : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
