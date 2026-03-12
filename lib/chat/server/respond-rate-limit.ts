import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import type { ChatRespondUsageTier } from "@/lib/chat/server/respond-types";
import { getLogger } from "@/lib/utils/logger";

const ANON_SESSION_COOKIE = "chat-anon-session";
// Single-process in-memory limiter only. This protects a single app instance and
// is intentionally not a distributed/shared quota system.
const log = getLogger("chat:respond-rate-limit");
const ANON_FALLBACK_PROCESS_KEY = `anon-fallback:${process.pid}:${Date.now().toString(36)}`;
const MAX_RATE_LIMIT_BUCKET_ENTRIES = 500;
let hasWarnedDegradedAnonymousFallback = false;

type Bucket = {
  count: number;
  resetAt: number;
};

interface BurstLimiterOptions {
  identity: ChatRespondUsageIdentity;
  hasMembership: boolean;
}

interface QuotaLimiterOptions {
  identity: ChatRespondUsageIdentity;
  hasMembership: boolean;
}

interface UsageLimitResult {
  allowed: boolean;
  status?: number;
  error?: string;
  reason?: "burst" | "quota";
  retryAfterSeconds?: number;
  tier: ChatRespondUsageTier;
  anonymousSessionId?: string;
}

export interface ChatRespondUsageIdentity {
  ip: string | null;
  privyUserId: string | null;
  identityKey: string;
  anonymousSessionId?: string;
  shouldSetAnonymousCookie: boolean;
}

const burstBuckets = new Map<string, Bucket>();
const quotaBuckets = new Map<string, Bucket>();

function trimBucketStore(store: Map<string, Bucket>, now = Date.now()) {
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) {
      store.delete(key);
    }
  }

  while (store.size > MAX_RATE_LIMIT_BUCKET_ENTRIES) {
    const oldestKey = store.keys().next().value as string | undefined;
    if (!oldestKey) {
      break;
    }
    store.delete(oldestKey);
  }
}

function getClientIp(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ip = forwardedFor.split(",")[0]?.trim();
    if (ip) return ip;
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return null;
}

function getTier(
  privyUserId: string | null,
  hasMembership: boolean,
): ChatRespondUsageTier {
  if (!privyUserId) {
    return "anonymous";
  }

  if (hasMembership) {
    return "member";
  }

  return "authenticated";
}

function getEnvNumber(name: string, fallback: number) {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getBurstWindowMs() {
  return getEnvNumber("CHAT_RESPOND_BURST_WINDOW_MS", 60_000);
}

function getQuotaWindowMs() {
  return getEnvNumber("CHAT_RESPOND_QUOTA_WINDOW_MS", 24 * 60 * 60_000);
}

function getBurstLimit(tier: ChatRespondUsageTier) {
  switch (tier) {
    case "member":
      return getEnvNumber("CHAT_RESPOND_BURST_MEMBER_MAX", 20);
    case "authenticated":
      return getEnvNumber("CHAT_RESPOND_BURST_AUTH_MAX", 10);
    default:
      return getEnvNumber("CHAT_RESPOND_BURST_ANON_MAX", 4);
  }
}

function getQuotaLimit(tier: ChatRespondUsageTier) {
  switch (tier) {
    case "member":
      return getEnvNumber("CHAT_RESPOND_QUOTA_MEMBER_MAX", 300);
    case "authenticated":
      return getEnvNumber("CHAT_RESPOND_QUOTA_AUTH_MAX", 100);
    default:
      return getEnvNumber("CHAT_RESPOND_QUOTA_ANON_MAX", 20);
  }
}

function hitBucket(
  store: Map<string, Bucket>,
  key: string,
  limit: number,
  windowMs: number,
) {
  const now = Date.now();
  trimBucketStore(store, now);
  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    trimBucketStore(store, now);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

function resolveAnonymousSessionId(req: NextRequest) {
  const existing = req.cookies.get(ANON_SESSION_COOKIE)?.value;
  if (existing) {
    return { anonymousSessionId: existing, created: false };
  }

  try {
    return {
      anonymousSessionId: randomUUID(),
      created: true,
    };
  } catch (error) {
    log.warn("Failed to generate anonymous chat session id", { error });
    return null;
  }
}

export function getChatAnonymousSessionCookieName() {
  return ANON_SESSION_COOKIE;
}

export function clearChatRespondRateLimitState() {
  burstBuckets.clear();
  quotaBuckets.clear();
  hasWarnedDegradedAnonymousFallback = false;
}

export function getChatRespondRateLimitBucketSizes() {
  return {
    burst: burstBuckets.size,
    quota: quotaBuckets.size,
  };
}

export function resolveChatRespondUsageIdentity(
  req: NextRequest,
  privyUserId: string | null,
): ChatRespondUsageIdentity {
  const ip = getClientIp(req);
  const anonSession = !privyUserId ? resolveAnonymousSessionId(req) : null;
  const degradedAnonymousIdentity =
    !privyUserId && !anonSession?.anonymousSessionId && !ip
      ? ANON_FALLBACK_PROCESS_KEY
      : null;
  const identityKey = privyUserId
    ? `user:${privyUserId}`
    : anonSession?.anonymousSessionId
      ? `anon-session:${anonSession.anonymousSessionId}`
      : ip
        ? `anon-ip:${ip}`
        : (degradedAnonymousIdentity as string);

  if (!privyUserId && !anonSession?.anonymousSessionId && !ip) {
    if (!hasWarnedDegradedAnonymousFallback) {
      hasWarnedDegradedAnonymousFallback = true;
      log.warn(
        "Using degraded anonymous chat rate-limit identity without session or IP; fallback is process-local only",
        {
          identityKey,
        },
      );
    }
  }

  return {
    ip,
    privyUserId,
    identityKey,
    anonymousSessionId: anonSession?.anonymousSessionId,
    shouldSetAnonymousCookie: Boolean(anonSession?.created),
  };
}

export function enforceChatRespondBurstLimit({
  identity,
  hasMembership,
}: BurstLimiterOptions): UsageLimitResult {
  const tier = getTier(identity.privyUserId, hasMembership);
  const burstWindowMs = getBurstWindowMs();
  const { ip, identityKey } = identity;

  const burstKeys = identity.privyUserId
    ? [identityKey]
    : ([identityKey, ip ? `anon-ip:${ip}` : null].filter(Boolean) as string[]);

  for (const key of burstKeys) {
    const burst = hitBucket(
      burstBuckets,
      `burst:${key}`,
      getBurstLimit(tier),
      burstWindowMs,
    );
    if (!burst.allowed) {
      return {
        allowed: false,
        status: 429,
        error: "Too many chat requests. Please wait and try again.",
        reason: "burst",
        retryAfterSeconds: burst.retryAfterSeconds,
        tier,
        anonymousSessionId: identity.shouldSetAnonymousCookie
          ? identity.anonymousSessionId
          : undefined,
      };
    }
  }

  return {
    allowed: true,
    tier,
    anonymousSessionId: identity.shouldSetAnonymousCookie
      ? identity.anonymousSessionId
      : undefined,
  };
}

export function enforceChatRespondQuotaLimit({
  identity,
  hasMembership,
}: QuotaLimiterOptions): UsageLimitResult {
  const tier = getTier(identity.privyUserId, hasMembership);
  const quotaWindowMs = getQuotaWindowMs();
  const { identityKey } = identity;

  const quota = hitBucket(
    quotaBuckets,
    `quota:${identityKey}`,
    getQuotaLimit(tier),
    quotaWindowMs,
  );

  if (!quota.allowed) {
    return {
      allowed: false,
      status: 429,
      error: "Chat usage limit reached for this period.",
      reason: "quota",
      retryAfterSeconds: quota.retryAfterSeconds,
      tier,
      anonymousSessionId: identity.shouldSetAnonymousCookie
        ? identity.anonymousSessionId
        : undefined,
    };
  }

  return {
    allowed: true,
    tier,
    anonymousSessionId: identity.shouldSetAnonymousCookie
      ? identity.anonymousSessionId
      : undefined,
  };
}
