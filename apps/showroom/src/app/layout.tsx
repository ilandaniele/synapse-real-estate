import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Providers } from "@/lib/query";
import "./globals.css";

export const metadata: Metadata = {
  title: "Showroom inmobiliario",
  description: "Showroom inmobiliario: masterplan 3D, tour 360 de la vivienda, unidades, ubicación y contacto.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh antialiased">
        <Providers>
          <a
            href="#contenido"
            className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-3 focus:text-slate-900"
          >
            Saltar al contenido
          </a>
          <SiteHeader />
          <main id="contenido">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
