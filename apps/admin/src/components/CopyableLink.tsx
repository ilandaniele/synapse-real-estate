"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui";

/** A one-time link shown read-only with a copy button, for sharing by hand when there is no email server. */
export function CopyableLink({ label, link, hint, testId }: { label: string; link: string; hint: string; testId: string }) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  };

  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <label htmlFor={id} className="text-sm font-medium text-gray-800">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          readOnly
          value={link}
          data-testid={`${testId}-value`}
          className="min-h-10 w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-1.5 font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button onClick={() => void copy()} data-testid={`${testId}-copy`}>
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <p className="text-xs text-gray-600" aria-live="polite">
        {hint}
      </p>
    </div>
  );
}
