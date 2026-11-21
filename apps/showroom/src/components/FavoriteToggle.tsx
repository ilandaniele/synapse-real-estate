"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { useBuyer, useToggleFavorite } from "@/lib/buyer";

const BASE =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-[#8a6a22] transition-colors hover:bg-slate-100 disabled:opacity-50";

/** Heart that saves a unit for the signed-in buyer; signed out, it leads to the account page. */
export function FavoriteToggle({ unitId, unitName, testId }: { unitId: string; unitName: string; testId: string }) {
  const { t } = useI18n();
  const buyer = useBuyer();
  const toggle = useToggleFavorite();

  if (buyer.data === null || buyer.isError) {
    return (
      <Link href="/cuenta" data-buyer-only data-testid={testId} aria-label={t.favorites.signInToSave(unitName)} className={BASE}>
        <Heart aria-hidden="true" size={20} />
      </Link>
    );
  }

  const saved = buyer.data?.favoriteUnitIds.includes(unitId) ?? false;
  return (
    <span data-buyer-only className="inline-flex flex-col items-end">
      <button
        type="button"
        data-testid={testId}
        aria-pressed={saved}
        aria-label={saved ? t.favorites.remove(unitName) : t.favorites.save(unitName)}
        disabled={buyer.isPending}
        onClick={() => toggle.mutate({ unitId, saved: !saved })}
        className={BASE}
      >
        <Heart aria-hidden="true" size={20} fill={saved ? "currentColor" : "none"} />
      </button>
      {toggle.isError ? (
        <span role="alert" className="mt-1 text-xs text-red-700">
          {t.favorites.failed}
        </span>
      ) : null}
    </span>
  );
}
