import { createPublicClientUnified } from "@/lib/blockchain/config/clients/public-client";
import { checkUserKeyOwnership } from "@/lib/services/user-key-service";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("chat:respond-membership");
const MEMBERSHIP_CACHE_TTL_MS = 5 * 60_000;
const MAX_MEMBERSHIP_CACHE_ENTRIES = 200;
let hasWarnedMissingMembershipEnv = false;

// Single-process in-memory cache only. This avoids repeated chain reads on one
// app instance but is not shared across instances.
const membershipCache = new Map<
  string,
  { hasMembership: boolean; expiresAt: number }
>();

function trimMembershipCache(now = Date.now()) {
  for (const [key, entry] of membershipCache) {
    if (entry.expiresAt <= now) {
      membershipCache.delete(key);
    }
  }

  while (membershipCache.size > MAX_MEMBERSHIP_CACHE_ENTRIES) {
    const oldestKey = membershipCache.keys().next().value as string | undefined;
    if (!oldestKey) {
      break;
    }
    membershipCache.delete(oldestKey);
  }
}

export async function hasActiveChatMembership(
  privyUserId: string | null | undefined,
) {
  if (!privyUserId) {
    return false;
  }

  trimMembershipCache();
  const cached = membershipCache.get(privyUserId);
  if (cached && cached.expiresAt > Date.now()) {
    membershipCache.delete(privyUserId);
    membershipCache.set(privyUserId, cached);
    return cached.hasMembership;
  }

  const lockAddress = process.env.NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS;
  if (!lockAddress) {
    if (!hasWarnedMissingMembershipEnv) {
      hasWarnedMissingMembershipEnv = true;
      log.warn(
        "NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS is missing; chat membership tier is disabled and all callers will be treated as non-members",
      );
    }
    return false;
  }

  try {
    const publicClient = createPublicClientUnified();
    const result = await checkUserKeyOwnership(
      publicClient,
      privyUserId,
      lockAddress,
    );
    const hasMembership = result.hasValidKey;
    membershipCache.set(privyUserId, {
      hasMembership,
      expiresAt: Date.now() + MEMBERSHIP_CACHE_TTL_MS,
    });
    trimMembershipCache();
    return hasMembership;
  } catch (error) {
    log.warn("Failed to resolve chat membership status", {
      privyUserId,
      error,
    });
    return false;
  }
}

export function clearChatMembershipCache() {
  membershipCache.clear();
  hasWarnedMissingMembershipEnv = false;
}

export function getChatMembershipCacheSize() {
  return membershipCache.size;
}
