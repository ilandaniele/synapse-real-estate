"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { can, type Action } from "@synapse/domain";
import { ErrorState, Spinner } from "@synapse/ui";
import { api, ApiRequestError, errorMessage } from "@/lib/api";
import { useMe } from "@/lib/queries";
import { SessionProvider, useUser } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/format";
import { Button } from "@/components/ui";

const NAV = [
  { slug: "dashboard", href: "/", label: "Resumen" },
  { slug: "developments", href: "/developments", label: "Desarrollos" },
  { slug: "leads", href: "/leads", label: "Leads" },
  { slug: "assets", href: "/assets", label: "Activos" },
  { slug: "jobs", href: "/jobs", label: "Procesos" },
  { slug: "members", href: "/members", label: "Miembros" },
] as const;

const NAV_PERMISSIONS: Partial<Record<(typeof NAV)[number]["slug"], Action>> = { leads: "lead:read", members: "member:manage" };

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const me = useMe();
  const unauthenticated = me.error instanceof ApiRequestError && me.error.status === 401;

  useEffect(() => {
    if (unauthenticated) router.replace("/login");
  }, [unauthenticated, router]);

  if (me.isPending || unauthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center" data-testid="auth-loading">
        <Spinner label="Comprobando sesión" />
      </div>
    );
  }
  if (me.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <ErrorState message={errorMessage(me.error)} onRetry={() => void me.refetch()} />
      </div>
    );
  }
  return (
    <SessionProvider user={me.data}>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const user = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  const logout = useMutation({
    mutationFn: () => api<void>("/auth/logout", { method: "POST" }),
    onSettled: () => {
      queryClient.clear();
      router.replace("/login");
    },
  });

  const items = NAV.filter((item) => {
    const action = NAV_PERMISSIONS[item.slug];
    return !action || can(user.role, action);
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-base font-semibold">Synapse Backoffice</span>
            <nav aria-label="Principal" className="flex flex-wrap gap-1">
              {items.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.slug}
                    href={item.href}
                    data-testid={`nav-${item.slug}`}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-blue-50 text-blue-800" : "text-gray-700 hover:bg-gray-100"}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="text-right leading-tight" data-testid="user-info">
              <div data-testid="user-email">{user.email}</div>
              <div className="text-xs text-gray-600">
                <span data-testid="user-role">{ROLE_LABELS[user.role]}</span> · <span data-testid="user-org">{user.organizationName}</span>
              </div>
            </div>
            <Link href="/account" data-testid="nav-account" aria-current={pathname.startsWith("/account") ? "page" : undefined} className="rounded-md px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-100">
              Mi cuenta
            </Link>
            <Button onClick={() => logout.mutate()} disabled={logout.isPending} data-testid="logout">
              Cerrar sesión
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
