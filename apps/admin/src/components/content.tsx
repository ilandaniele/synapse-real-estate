"use client";

import { useEffect, useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useUnits } from "@/lib/queries";
import { IMAGE_EXTENSIONS, uploadAsset, validateImageForUpload } from "@/lib/upload";
import { Button, ErrorBanner, SelectField } from "./ui";

/** State for an `ImageField`: the picked file, its validation and the upload done on save. */
export function useImageInput({ required, onSelect }: { required: boolean; onSelect?: (file: File) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [progress, setProgress] = useState<number | null>(null);
  return {
    validate: () => fileError ?? (required && !file ? "Elige una imagen." : undefined),
    upload: async () => {
      if (!file) return undefined;
      try {
        return await uploadAsset(file, setProgress);
      } finally {
        setProgress(null);
      }
    },
    fieldProps: {
      file,
      fileError,
      progress,
      onFile: (selected: File | null) => {
        const error = selected ? validateImageForUpload(selected).message : undefined;
        setFile(selected);
        setFileError(error);
        if (selected && !error) onSelect?.(selected);
      },
    },
  };
}

export function ImageField({
  label,
  file,
  currentUrl,
  progress,
  error,
  fileError,
  disabled,
  testId,
  onFile,
}: {
  label: string;
  file: File | null;
  currentUrl?: string;
  progress: number | null;
  error?: string;
  fileError?: string;
  disabled?: boolean;
  testId: string;
  onFile: (file: File | null) => void;
}) {
  const inputId = useId();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return setPreviewUrl(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const shown = previewUrl ?? currentUrl;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-gray-800">
        {label}
      </label>
      {shown ? <img src={shown} alt="" data-testid={`${testId}-preview`} className="max-h-40 w-fit rounded border border-gray-200 object-contain" /> : null}
      <input
        id={inputId}
        type="file"
        accept={IMAGE_EXTENSIONS}
        disabled={disabled}
        data-testid={testId}
        aria-invalid={error || fileError ? true : undefined}
        className="text-sm"
        onChange={(e) => {
          onFile(e.target.files?.[0] ?? null);
        }}
      />
      <span className="text-xs text-gray-500">JPG, PNG, WebP o SVG.{currentUrl ? " Déjalo vacío para conservar la imagen actual." : ""}</span>
      {progress !== null ? <progress value={progress} max={1} aria-label="Progreso de subida" className="w-full" /> : null}
      {error || fileError ? (
        <p role="alert" data-testid={`${testId}-error`} className="text-sm text-red-700">
          {error || fileError}
        </p>
      ) : null}
    </div>
  );
}

export function UnitSelect({
  developmentId,
  value,
  disabled,
  error,
  testId,
  onChange,
}: {
  developmentId: string;
  value: string | null;
  disabled?: boolean;
  error?: string;
  testId: string;
  onChange: (unitId: string | null) => void;
}) {
  const units = useUnits(developmentId);
  return (
    <SelectField label="Unidad" value={value ?? ""} disabled={disabled} error={error} testId={testId} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Toda la promoción</option>
      {(units.data ?? []).map((unit) => (
        <option key={unit.id} value={unit.id}>
          {unit.code} · {unit.name}
        </option>
      ))}
    </SelectField>
  );
}

/** Delete button with an inline confirmation step. Test ids: `<testId>`, `-confirm`, `-cancel`, `-error`. */
export function ConfirmDelete({
  subject,
  buttonLabel,
  testId,
  remove,
  onDeleted,
}: {
  subject: string;
  buttonLabel: string;
  testId: string;
  remove: () => Promise<unknown>;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const del = useMutation({ mutationFn: remove, onSuccess: onDeleted });
  return (
    <div className="mt-5 flex flex-col gap-2 border-t border-gray-200 pt-4">
      <ErrorBanner error={del.error} testId={`${testId}-error`} />
      {confirming ? (
        <div role="alertdialog" aria-label={`Confirmar borrado de ${subject}`} className="flex flex-wrap items-center gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm">
          <span>¿Borrar {subject}? Esta acción no se puede deshacer.</span>
          <Button variant="danger" disabled={del.isPending} onClick={() => del.mutate()} data-testid={`${testId}-confirm`}>
            Sí, borrar
          </Button>
          <Button onClick={() => setConfirming(false)} data-testid={`${testId}-cancel`}>
            Cancelar
          </Button>
        </div>
      ) : (
        <div>
          <Button variant="danger" onClick={() => setConfirming(true)} data-testid={testId}>
            {buttonLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
