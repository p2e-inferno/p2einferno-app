import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import type { ChatRespondUsageTier } from "@/lib/chat/server/respond-types";
import { getUpstashRedis } from "@/lib/upstash/redis";
import { getLogger } from "@/lib/utils/logger";

const ANON_SESSION_COOKIE = "chat-anon-session";
// Single-process in-memory limiter only. This protects a single app instance and
// is intentionally not a distributed/shared quota system.
const log = getLogger("chat:respond-rate-limit");
const ANON_FALLBACK_PROCESS_KEY = `anon-fallback:${process.pid}:${Date.now().toString(36)}`;
const MAX_RATE_LIMIT_BUCKET_ENTRIES = 500;
let hasWarnedDegradedAnonymousFallback = false;
let hasWarnedRedisFallback = false;
let hasLoggedRedisBackend = false;

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

export interface UsageLimitResult {
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
const attachmentBurstBuckets = new Map<string, Bucket>();
const attachmentQuotaBuckets = new Map<string, Bucket>();

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

function getRedisRetryAfterSeconds(ttlMs: number | null | undefined) {
  if (typeof ttlMs !== "number" || ttlMs <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(ttlMs / 1000));
}

function getRateLimitKeyPrefix() {
  const environment =
    process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
  const parts = ["chat-rate-limit", environment];

  if (environment !== "production" && process.env.VERCEL_URL) {
    parts.push(process.env.VERCEL_URL);
  }

  return parts.join(":");
}

function buildRateLimitKey(key: string) {
  return `${getRateLimitKeyPrefix()}:${key}`;
}

const HIT_BUCKET_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])

local current = redis.call("GET", key)
if not current then
  redis.call("SET", key, 1, "PX", window_ms)
  return {1, 1, window_ms}
end

current = redis.call("INCR", key)
local ttl = redis.call("PTTL", key)

if ttl < 0 then
  redis.call("PEXPIRE", key, window_ms)
  ttl = window_ms
end

if current > limit then
  return {0, current, ttl}
end

return {1, current, ttl}
`;

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
  return getEnvNumber("CHAT_RESPOND_BURST_WINDOW_MS", 90_000);
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

function hitBucketInMemory(
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

async function hitBucket(
  store: Map<string, Bucket>,
  key: string,
  limit: number,
  windowMs: number,
) {
  const redis = getUpstashRedis();

  if (!hasLoggedRedisBackend) {
    hasLoggedRedisBackend = true;
    log.info("Chat rate limiting backend resolved", {
      backend: redis ? "upstash-redis" : "in-memory",
    });
  }

  if (!redis) {
    if (!hasWarnedRedisFallback) {
      hasWarnedRedisFallback = true;
      log.warn(
        "Upstash Redis is not configured for chat rate limiting; falling back to in-memory buckets",
      );
    }

    return hitBucketInMemory(store, key, limit, windowMs);
  }

  const redisKey = buildRateLimitKey(key);
  let result: [number, number, number] | null = null;
  try {
    result = (await redis.eval(HIT_BUCKET_LUA, [redisKey], [
      `${limit}`,
      `${windowMs}`,
    ])) as [number, number, number] | null;
  } catch (error) {
    log.error(
      "Redis rate-limit eval failed; falling back to in-memory buckets",
      {
        key: redisKey,
        error,
      },
    );
    return hitBucketInMemory(store, key, limit, windowMs);
  }

  const [allowedFlag, _count, ttlMs] = Array.isArray(result)
    ? result
    : [0, 0, windowMs];

  return {
    allowed: allowedFlag === 1,
    retryAfterSeconds:
      allowedFlag === 1 ? 0 : getRedisRetryAfterSeconds(ttlMs),
  };
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
  attachmentBurstBuckets.clear();
  attachmentQuotaBuckets.clear();
  hasWarnedDegradedAnonymousFallback = false;
  hasWarnedRedisFallback = false;
  hasLoggedRedisBackend = false;
}

export function getChatRespondRateLimitBucketSizes() {
  return {
    burst: burstBuckets.size,
    quota: quotaBuckets.size,
    attachmentBurst: attachmentBurstBuckets.size,
    attachmentQuota: attachmentQuotaBuckets.size,
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

export async function enforceChatRespondBurstLimit({
  identity,
  hasMembership,
}: BurstLimiterOptions): Promise<UsageLimitResult> {
  const tier = getTier(identity.privyUserId, hasMembership);
  const burstWindowMs = getBurstWindowMs();
  const { ip, identityKey } = identity;

  const burstKeys = identity.privyUserId
    ? [identityKey]
    : Array.from(
        new Set(
          [identityKey, ip ? `anon-ip:${ip}` : null].filter(Boolean) as string[],
        ),
      );

  for (const key of burstKeys) {
    const burst = await hitBucket(
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

export async function enforceChatRespondQuotaLimit({
  identity,
  hasMembership,
}: QuotaLimiterOptions): Promise<UsageLimitResult> {
  const tier = getTier(identity.privyUserId, hasMembership);
  const quotaWindowMs = getQuotaWindowMs();
  const { identityKey } = identity;

  const quota = await hitBucket(
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

function getAttachmentBurstLimit(tier: ChatRespondUsageTier) {
  switch (tier) {
    case "member":
      return getEnvNumber("CHAT_ATTACHMENT_UPLOAD_BURST_MEMBER_MAX", 10);
    case "authenticated":
      return getEnvNumber("CHAT_ATTACHMENT_UPLOAD_BURST_AUTH_MAX", 6);
    default:
      return getEnvNumber("CHAT_ATTACHMENT_UPLOAD_BURST_ANON_MAX", 3);
  }
}

function getAttachmentQuotaLimit(tier: ChatRespondUsageTier) {
  switch (tier) {
    case "member":
      return getEnvNumber("CHAT_ATTACHMENT_UPLOAD_QUOTA_MEMBER_MAX", 60);
    case "authenticated":
      return getEnvNumber("CHAT_ATTACHMENT_UPLOAD_QUOTA_AUTH_MAX", 30);
    default:
      return getEnvNumber("CHAT_ATTACHMENT_UPLOAD_QUOTA_ANON_MAX", 12);
  }
}

export async function enforceChatAttachmentUploadBurstLimit({
  identity,
  hasMembership,
}: BurstLimiterOptions): Promise<UsageLimitResult> {
  const tier = getTier(identity.privyUserId, hasMembership);
  const burstWindowMs = getBurstWindowMs();
  const { ip, identityKey } = identity;

  const burstKeys = identity.privyUserId
    ? [identityKey]
    : Array.from(
        new Set(
          [identityKey, ip ? `anon-ip:${ip}` : null].filter(Boolean) as string[],
        ),
      );

  for (const key of burstKeys) {
    const burst = await hitBucket(
      attachmentBurstBuckets,
      `attachment-burst:${key}`,
      getAttachmentBurstLimit(tier),
      burstWindowMs,
    );
    if (!burst.allowed) {
      return {
        allowed: false,
        status: 429,
        error: "Too many attachment uploads. Please wait and try again.",
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

export async function enforceChatAttachmentUploadQuotaLimit({
  identity,
  hasMembership,
}: QuotaLimiterOptions): Promise<UsageLimitResult> {
  const tier = getTier(identity.privyUserId, hasMembership);
  const quota = await hitBucket(
    attachmentQuotaBuckets,
    `attachment-quota:${identity.identityKey}`,
    getAttachmentQuotaLimit(tier),
    getQuotaWindowMs(),
  );

  if (!quota.allowed) {
    return {
      allowed: false,
      status: 429,
      error: "Attachment upload limit reached for now. Please try again later.",
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
