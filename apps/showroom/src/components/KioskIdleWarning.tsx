"use client";

import { useI18n } from "@/i18n/I18nProvider";
import { Modal } from "./Modal";

export function KioskIdleWarning({ secondsLeft, onContinue }: { secondsLeft: number; onContinue: () => void }) {
  const { t } = useI18n();
  return (
    <Modal title={t.kiosk.title} onClose={onContinue} testId="kiosk-idle-warning" className="max-w-md">
      <p className="text-white/85">
        {t.kiosk.before}{" "}
        <span className="font-semibold text-[#f0d79a]" data-testid="kiosk-idle-countdown">
          {secondsLeft}
        </span>{" "}
        {t.kiosk.after}
      </p>
      <button
        type="button"
        onClick={onContinue}
        data-testid="kiosk-idle-continue"
        className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-[#d9b46a] px-6 font-semibold text-[#0b1220] hover:bg-[#e6c785]"
      >
        {t.kiosk.continue}
      </button>
    </Modal>
  );
}
