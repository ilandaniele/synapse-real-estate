"use client";

import Link from "next/link";
import type { BuyerProfile } from "@synapse/contracts";
import { localize } from "@synapse/domain";
import { EmptyState, ErrorState, Spinner } from "@synapse/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useBuyerLogout, useFavorites } from "@/lib/buyer";
import { unitHasTour } from "@/lib/manifest";
import { useManifest } from "@/lib/query";
import { UnitTile } from "../UnitTile";
import { BTN_SECONDARY } from "../UnitCard";

function FavoritesList() {
  const { locale, t } = useI18n();
  const favorites = useFavorites(true);
  const scenes = useManifest().data?.scenes ?? [];

  if (favorites.isPending) {
    return (
      <div className="flex justify-center py-12" data-testid="favorites-loading">
        <Spinner label={t.common.loading} />
      </div>
    );
  }
  if (favorites.isError) {
    return <ErrorState message={t.account.favoritesError} retryLabel={t.common.retry} onRetry={() => void favorites.refetch()} />;
  }
  if (favorites.data.length === 0) {
    return (
      <EmptyState
        title={t.account.favoritesEmpty}
        action={
          <Link href="/unidades" className={BTN_SECONDARY}>
            {t.account.favoritesEmptyAction}
          </Link>
        }
      />
    );
  }
  return (
    <ul className="m-0 grid list-none gap-5 p-0 sm:grid-cols-2 xl:grid-cols-3" data-testid="favorites-grid">
      {favorites.data.map((unit) => (
        <UnitTile key={unit.id} unit={localize(unit, locale)} hasTour={unitHasTour(scenes, unit.id)} />
      ))}
    </ul>
  );
}

export function FavoritesPanel({ buyer }: { buyer: BuyerProfile }) {
  const { t } = useI18n();
  const logout = useBuyerLogout();
  return (
    <div data-testid="buyer-account">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <p className="text-lg" data-testid="buyer-greeting">
          {t.account.greeting(buyer.name)}
        </p>
        <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending} data-testid="buyer-logout" className={BTN_SECONDARY}>
          {t.account.logout}
        </button>
      </div>
      {logout.isError ? (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {t.account.errors.failed}
        </p>
      ) : null}
      <h2 className="mb-4 text-xl font-semibold">{t.account.favoritesTitle}</h2>
      <FavoritesList />
    </div>
  );
}
