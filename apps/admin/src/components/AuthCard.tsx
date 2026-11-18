import type { ReactNode } from "react";

export function AuthCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <section className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm" aria-labelledby="auth-title">
        <h1 id="auth-title" className="mb-1 text-xl font-semibold">
          {title}
        </h1>
        {description ? <p className="mb-4 text-sm text-gray-600">{description}</p> : null}
        {children}
      </section>
    </main>
  );
}

export function AuthNotice({ children, tone = "info", testId }: { children: ReactNode; tone?: "info" | "error"; testId?: string }) {
  const colors = tone === "error" ? "border-red-300 bg-red-50 text-red-900" : "border-green-300 bg-green-50 text-green-900";
  return (
    <p role={tone === "error" ? "alert" : "status"} data-testid={testId} className={`rounded-md border p-2 text-sm ${colors}`}>
      {children}
    </p>
  );
}
