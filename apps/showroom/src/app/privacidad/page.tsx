"use client";

import { useI18n } from "@/i18n/I18nProvider";

export default function PrivacyPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
      <h1 className="text-3xl font-semibold">{t.privacy.title}</h1>
      <p className="mt-2 text-sm text-slate-500">{t.privacy.updated}</p>
      {t.privacy.sections.map((section) => (
        <section key={section.heading} className="mt-8">
          <h2 className="text-xl font-semibold">{section.heading}</h2>
          <p className="mt-2 text-slate-700">{section.body}</p>
        </section>
      ))}
    </div>
  );
}
