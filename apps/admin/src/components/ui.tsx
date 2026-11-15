"use client";

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { EmptyState, ErrorState, Spinner } from "@synapse/ui";
import { ApiRequestError, detailLines, errorMessage } from "@/lib/api";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 border-transparent",
  secondary: "bg-white text-gray-900 hover:bg-gray-100 border-gray-300",
  danger: "bg-red-600 text-white hover:bg-red-700 border-transparent",
  ghost: "bg-transparent text-blue-700 hover:bg-blue-50 border-transparent",
};

export function Button({
  variant = "secondary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

const CONTROL = "w-full min-h-10 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-500";

interface FieldShell {
  label: string;
  hint?: string;
  error?: string;
  testId?: string;
  className?: string;
}

export function TextField({ label, hint, error, testId, className = "", ...props }: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-gray-800">
        {label}
      </label>
      <input id={id} data-testid={testId} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} className={CONTROL} {...props} />
      {hint ? <span className="text-xs text-gray-500">{hint}</span> : null}
      {error ? (
        <span id={`${id}-err`} role="alert" className="text-xs text-red-700">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function TextAreaField({ label, hint, error, testId, className = "", ...props }: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-gray-800">
        {label}
      </label>
      <textarea id={id} data-testid={testId} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} rows={3} className={CONTROL} {...props} />
      {hint ? <span className="text-xs text-gray-500">{hint}</span> : null}
      {error ? (
        <span id={`${id}-err`} role="alert" className="text-xs text-red-700">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function SelectField({ label, hint, error, testId, className = "", children, ...props }: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-gray-800">
        {label}
      </label>
      <select id={id} data-testid={testId} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} className={CONTROL} {...props}>
        {children}
      </select>
      {hint ? <span className="text-xs text-gray-500">{hint}</span> : null}
      {error ? (
        <span id={`${id}-err`} role="alert" className="text-xs text-red-700">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${className}`}>
      {title || actions ? (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title ? <h2 className="text-base font-semibold">{title}</h2> : <span />}
          {actions}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description ? <p className="mt-1 text-sm text-gray-600">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Modal({ title, onClose, children, testId, wide = false }: { title: string; onClose: () => void; children: ReactNode; testId?: string; wide?: boolean }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>("input, select, textarea, button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid={testId} className={`my-8 w-full rounded-lg bg-white p-5 shadow-xl ${wide ? "max-w-3xl" : "max-w-lg"}`}>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <Button variant="ghost" onClick={onClose} aria-label="Cerrar">
            ✕
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Shows an API error plus its `details` lines (validation issues, manifest problems). */
export function ErrorBanner({ error, testId }: { error: unknown; testId?: string }) {
  if (!error) return null;
  const lines = error instanceof ApiRequestError ? detailLines(error.details) : [];
  return (
    <div role="alert" data-testid={testId} className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
      <p className="font-medium">{errorMessage(error)}</p>
      {lines.length > 0 ? (
        <ul className="mt-1 list-disc pl-5">
          {lines.map((line, i) => (
            <li key={i}>
              {line.path ? <code className="mr-1 rounded bg-red-100 px-1">{line.path}</code> : null}
              {line.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** loading / error / empty / data renderer for a TanStack query. */
export function QueryBoundary<T>({
  query,
  isEmpty,
  emptyTitle = "Sin datos",
  emptyDescription,
  emptyAction,
  children,
}: {
  query: UseQueryResult<T>;
  isEmpty?: (data: T) => boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) {
    return (
      <div className="flex justify-center p-8" data-testid="loading-state">
        <Spinner label="Cargando datos" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (isEmpty?.(query.data)) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }
  return <>{children(query.data)}</>;
}

export function TableShell({ children, testId, caption }: { children: ReactNode; testId?: string; caption: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table data-testid={testId} className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export const TH = "border-b border-gray-200 bg-gray-50 px-3 py-2 font-semibold text-gray-700";
export const TD = "border-b border-gray-100 px-3 py-2 align-middle";
