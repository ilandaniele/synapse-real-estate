"use client";

import { ErrorState, Spinner } from "@synapse/ui";
import { FavoritesPanel } from "@/components/account/FavoritesPanel";
import { SignInPanel } from "@/components/account/SignInPanel";
import { useI18n } from "@/i18n/I18nProvider";
import { useBuyer } from "@/lib/buyer";

function AccountBody() {
  const { t } = useI18n();
  const buyer = useBuyer();

  if (buyer.isPending) {
    return (
      <div className="flex justify-center py-16" data-testid="page-loading">
        <Spinner label={t.common.loading} />
      </div>
    );
  }
  if (buyer.isError) {
    return <ErrorState message={t.account.loadError} retryLabel={t.common.retry} onRetry={() => void buyer.refetch()} />;
  }
  if (buyer.data) return <FavoritesPanel buyer={buyer.data} />;
  return (
    <div className="mx-auto max-w-md">
      <p className="mb-6 text-slate-700">{t.account.intro}</p>
      <SignInPanel />
    </div>
  );
}

export default function AccountPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-12 lg:px-8">
      <h1 className="mb-8 text-3xl font-semibold">{t.account.title}</h1>
      <AccountBody />
    </div>
  );
}
