"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, AuthProviders, BuyerFavorites, BuyerProfile, type BuyerRegisterInput, type LoginInput } from "@synapse/contracts";
import { AUTH_PROVIDERS_URL, BUYER_URL } from "./config";
import { BuyerRequestError, toggledFavoriteIds } from "./buyer-state";

const ME_KEY = ["buyer", "me"] as const;
const FAVORITES_KEY = ["buyer", "favorites"] as const;

async function buyerRequest(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${BUYER_URL}${path}`, {
      method: init.method ?? "GET",
      credentials: "include",
      signal: init.signal,
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new BuyerRequestError("offline");
  }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => null);
  if (res.ok) return json;
  const apiError = ApiError.safeParse(json);
  throw new BuyerRequestError(apiError.success ? apiError.data.error.code : "unknown", res.status);
}

/** The signed-in buyer, or null when nobody is signed in. */
async function fetchMe(signal: AbortSignal): Promise<BuyerProfile | null> {
  try {
    return BuyerProfile.parse(await buyerRequest("/me", { signal }));
  } catch (error) {
    if (error instanceof BuyerRequestError && error.status === 401) return null;
    throw error;
  }
}

export function useBuyer() {
  return useQuery({ queryKey: ME_KEY, queryFn: ({ signal }) => fetchMe(signal), retry: false, staleTime: 60_000 });
}

export function useFavorites(enabled: boolean) {
  return useQuery({
    queryKey: FAVORITES_KEY,
    enabled,
    queryFn: async ({ signal }) => BuyerFavorites.parse(await buyerRequest("/favorites", { signal })).items,
  });
}

export function useAuthProviders() {
  return useQuery({
    queryKey: ["auth-providers"],
    staleTime: 10 * 60_000,
    queryFn: async ({ signal }) => {
      const res = await fetch(AUTH_PROVIDERS_URL, { signal });
      if (!res.ok) throw new Error(`providers ${res.status}`);
      return AuthProviders.parse(await res.json());
    },
  });
}

export type BuyerSignIn =
  | { kind: "login"; body: LoginInput }
  | { kind: "register"; body: BuyerRegisterInput }
  | { kind: "google"; body: { credential: string } };

export function useBuyerSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, body }: BuyerSignIn) => buyerRequest(`/${kind}`, { method: "POST", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["buyer"] }),
  });
}

export function useBuyerLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => buyerRequest("/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: FAVORITES_KEY });
      queryClient.setQueryData(ME_KEY, null);
    },
  });
}

/** Saves or removes a unit, updating the heart at once and rolling back if the API refuses. */
export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ unitId, saved }: { unitId: string; saved: boolean }) =>
      buyerRequest(`/favorites/${unitId}`, { method: saved ? "PUT" : "DELETE" }),
    onMutate: async ({ unitId, saved }) => {
      await queryClient.cancelQueries({ queryKey: ME_KEY });
      const previous = queryClient.getQueryData<BuyerProfile | null>(ME_KEY);
      if (previous) queryClient.setQueryData(ME_KEY, { ...previous, favoriteUnitIds: toggledFavoriteIds(previous.favoriteUnitIds, unitId, saved) });
      return { previous };
    },
    onError: (_error, _variables, context) => queryClient.setQueryData(ME_KEY, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["buyer"] }),
  });
}
