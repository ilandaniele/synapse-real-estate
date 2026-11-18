"use client";

import { useQuery } from "@tanstack/react-query";
import type { Asset, Development, FloorPlan, GalleryItem, Invitation, Job, Lead, Member, PointOfInterest, Publication, PublicationDiff, Reservation, Scene, SessionUser, Unit, VisitAnalytics, WebhookDelivery, WebhookEndpoint } from "@synapse/contracts";
import type { JobStatus, UnitStatus } from "@synapse/domain";
import { api, ApiRequestError } from "./api";

export interface Dashboard {
  unitsByStatus: Record<UnitStatus, number>;
  leadsLast30Days: number;
  lastPublication: { version: number; publishedAt: string; developmentId: string; developmentName: string; publishedBy: string } | null;
  jobsByStatus: Record<JobStatus, number>;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type LeadsPage = Paged<Lead>;
export type ReservationsPage = Paged<Reservation>;

export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = ["PENDING", "PROCESSING"];
export const isActiveJob = (job: Pick<Job, "status">) => ACTIVE_JOB_STATUSES.includes(job.status);

export const keys = {
  me: ["me"] as const,
  dashboard: ["dashboard"] as const,
  developments: ["developments"] as const,
  development: (id: string) => ["developments", id] as const,
  units: (devId: string) => ["developments", devId, "units"] as const,
  scenes: (devId: string) => ["developments", devId, "scenes"] as const,
  floorPlans: (devId: string) => ["developments", devId, "floor-plans"] as const,
  gallery: (devId: string) => ["developments", devId, "gallery"] as const,
  pointsOfInterest: (devId: string) => ["developments", devId, "points-of-interest"] as const,
  publications: (devId: string) => ["developments", devId, "publications"] as const,
  analytics: (devId: string, days: number) => ["developments", devId, "analytics", days] as const,
  publicationDiff: (devId: string, from: number, to: number) => ["developments", devId, "publications", "diff", from, to] as const,
  scene: (id: string) => ["scenes", id] as const,
  hotspots: (sceneId: string) => ["scenes", sceneId, "hotspots"] as const,
  leads: (filters: unknown) => ["leads", filters] as const,
  lead: (id: string) => ["leads", "detail", id] as const,
  reservations: (filters: unknown) => ["reservations", filters] as const,
  assets: ["assets"] as const,
  jobs: ["jobs"] as const,
  job: (id: string) => ["jobs", id] as const,
  members: ["members"] as const,
  invitations: ["invitations"] as const,
  webhooks: ["webhooks"] as const,
  webhookDeliveries: (id: string) => ["webhooks", id, "deliveries"] as const,
};

/** 401/403/404 will not get better on retry. */
const retry = (count: number, error: Error) =>
  !(error instanceof ApiRequestError && [401, 403, 404].includes(error.status)) && count < 2;

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api<SessionUser>("/auth/me"), retry: false, staleTime: 60_000 });
export const useDashboard = () => useQuery({ queryKey: keys.dashboard, queryFn: () => api<Dashboard>("/admin/dashboard"), retry });
export const useDevelopments = () => useQuery({ queryKey: keys.developments, queryFn: () => api<Development[]>("/admin/developments"), retry });
export const useDevelopment = (id: string) =>
  useQuery({ queryKey: keys.development(id), queryFn: () => api<Development>(`/admin/developments/${id}`), retry });
export const useUnits = (devId: string) =>
  useQuery({ queryKey: keys.units(devId), queryFn: () => api<Unit[]>(`/admin/developments/${devId}/units`), enabled: Boolean(devId), retry });
export const useScenes = (devId: string | undefined) =>
  useQuery({
    queryKey: keys.scenes(devId ?? ""),
    queryFn: () => api<Scene[]>(`/admin/developments/${devId}/scenes`),
    enabled: Boolean(devId),
    retry,
  });
export const useFloorPlans = (devId: string) =>
  useQuery({ queryKey: keys.floorPlans(devId), queryFn: () => api<FloorPlan[]>(`/admin/developments/${devId}/floor-plans`), retry });
export const useGallery = (devId: string) =>
  useQuery({ queryKey: keys.gallery(devId), queryFn: () => api<GalleryItem[]>(`/admin/developments/${devId}/gallery`), retry });
export const usePointsOfInterest = (devId: string) =>
  useQuery({ queryKey: keys.pointsOfInterest(devId), queryFn: () => api<PointOfInterest[]>(`/admin/developments/${devId}/points-of-interest`), retry });
export const useMembers = () => useQuery({ queryKey: keys.members, queryFn: () => api<Member[]>("/admin/members"), retry });
export const useVisitAnalytics = (devId: string, days: number) =>
  useQuery({
    queryKey: keys.analytics(devId, days),
    queryFn: () => api<VisitAnalytics>(`/admin/developments/${devId}/analytics?days=${days}`),
    enabled: !!devId,
    retry,
  });
export const useWebhooks = () => useQuery({ queryKey: keys.webhooks, queryFn: () => api<WebhookEndpoint[]>("/admin/webhooks"), retry });
export const useWebhookDeliveries = (id: string) =>
  useQuery({ queryKey: keys.webhookDeliveries(id), queryFn: () => api<WebhookDelivery[]>(`/admin/webhooks/${id}/deliveries`), retry });
export const useInvitations = () => useQuery({ queryKey: keys.invitations, queryFn: () => api<Invitation[]>("/admin/invitations"), retry });
export const usePublications = (devId: string) =>
  useQuery({ queryKey: keys.publications(devId), queryFn: () => api<Publication[]>(`/admin/developments/${devId}/publications`), retry });
export const usePublicationDiff = (devId: string, from: number, to: number) =>
  useQuery({
    queryKey: keys.publicationDiff(devId, from, to),
    queryFn: () => api<PublicationDiff>(`/admin/developments/${devId}/publications/compare?from=${from}&to=${to}`),
    retry,
  });
export const useScene = (id: string) => useQuery({ queryKey: keys.scene(id), queryFn: () => api<Scene>(`/admin/scenes/${id}`), retry });
export const useAssets = () => useQuery({ queryKey: keys.assets, queryFn: () => api<Asset[]>("/admin/assets"), retry });

export const useJobs = () =>
  useQuery({
    queryKey: keys.jobs,
    queryFn: () => api<Job[]>("/admin/jobs"),
    retry,
    refetchInterval: (query) => (query.state.data?.some(isActiveJob) ? 3000 : false),
  });

export const useJob = (id: string | null) =>
  useQuery({
    queryKey: keys.job(id ?? ""),
    queryFn: () => api<Job>(`/admin/jobs/${id}`),
    enabled: Boolean(id),
    retry,
    refetchInterval: (query) => (query.state.data && isActiveJob(query.state.data) ? 3000 : false),
  });
