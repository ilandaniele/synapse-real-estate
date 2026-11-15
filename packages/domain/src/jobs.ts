export const JOB_STATUSES = ["PENDING", "PROCESSING", "REQUIRES_REVIEW", "COMPLETED", "FAILED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_KINDS = ["IMPORT", "RENDER"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const MAX_JOB_ATTEMPTS = 3;

const NEXT: Record<JobStatus, readonly JobStatus[]> = {
  PENDING: ["PROCESSING"],
  PROCESSING: ["COMPLETED", "FAILED", "REQUIRES_REVIEW", "PENDING"],
  REQUIRES_REVIEW: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: ["PENDING"],
};

export function canMoveJob(from: JobStatus, to: JobStatus): boolean {
  return NEXT[from].includes(to);
}

export function canRetry(status: JobStatus, attempts: number): boolean {
  return status === "FAILED" && attempts < MAX_JOB_ATTEMPTS;
}

export function retryDelayMs(attempts: number): number {
  return Math.min(60_000, 2_000 * 2 ** attempts);
}
