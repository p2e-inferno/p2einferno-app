// Centralized admin configuration for auth sessions and API behavior.
// These defaults are conservative and can be tuned via environment vars.

// Helper to parse integers with fallback
function toInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const ADMIN_SESSION_TTL_SECONDS: number = toInt(
  process.env.ADMIN_SESSION_TTL_SECONDS,
  60
);

export const ADMIN_RPC_TIMEOUT_MS: number = toInt(
  process.env.ADMIN_RPC_TIMEOUT_MS,
  10_000
);

export const ADMIN_MAX_PAGE_SIZE: number = toInt(
  process.env.ADMIN_MAX_PAGE_SIZE,
  200
);

// Cache keys/tags used by Route Handlers (future steps)
export const ADMIN_CACHE_TAGS = {
  task: (id: string) => `admin:task:${id}`,
  milestone: (id: string) => `admin:milestone:${id}`,
  cohort: (id: string) => `admin:cohort:${id}`,
  submissions: (taskId: string) => `admin:submissions:${taskId}`,
} as const;

// Small utility exposed for consistent pagination clamping
export function clampPageSize(size: number | undefined, max = ADMIN_MAX_PAGE_SIZE) {
  if (!size || size <= 0) return Math.min(50, max);
  return Math.min(size, max);
}

