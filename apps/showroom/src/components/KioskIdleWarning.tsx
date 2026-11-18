"use client";

import { Modal } from "./Modal";

export function KioskIdleWarning({ secondsLeft, onContinue }: { secondsLeft: number; onContinue: () => void }) {
  return (
    <Modal title="¿Seguís ahí?" onClose={onContinue} testId="kiosk-idle-warning" className="max-w-md">
      <p className="text-white/85">
        Por inactividad, la presentación vuelve al inicio en{" "}
        <span className="font-semibold text-[#f0d79a]" data-testid="kiosk-idle-countdown">
          {secondsLeft}
        </span>{" "}
        segundos.
      </p>
      <button
        type="button"
        onClick={onContinue}
        data-testid="kiosk-idle-continue"
        className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-[#d9b46a] px-6 font-semibold text-[#0b1220] hover:bg-[#e6c785]"
      >
        Seguir navegando
      </button>
    </Modal>
  );
}
