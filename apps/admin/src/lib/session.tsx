"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SessionUser } from "@synapse/contracts";
import { can, type Action } from "@synapse/domain";

const SessionContext = createContext<SessionUser | null>(null);

export function SessionProvider({ user, children }: { user: SessionUser; children: ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useUser(): SessionUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useUser must be used inside <SessionProvider>");
  return user;
}

/** UI-level permission hint; the API still enforces every action. */
export function useCan(action: Action): boolean {
  return can(useUser().role, action);
}
