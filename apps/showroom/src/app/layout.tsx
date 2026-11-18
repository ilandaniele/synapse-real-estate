import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { KioskMode } from "@/components/KioskMode";
import { SiteHeader } from "@/components/SiteHeader";
import { I18nProvider } from "@/i18n/I18nProvider";
import { MESSAGES } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { Providers } from "@/lib/query";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { meta } = MESSAGES[await getLocale()];
  return { title: meta.title, description: meta.description };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className="min-h-dvh antialiased">
        <I18nProvider initialLocale={locale}>
          <Providers>
            <a
              href="#contenido"
              className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-3 focus:text-slate-900"
            >
              {MESSAGES[locale].header.skipToContent}
            </a>
            <SiteHeader />
            <main id="contenido">{children}</main>
            <KioskMode />
          </Providers>
        </I18nProvider>
      </body>
    </html>
  );
}
