import type { SupabaseClient } from "@supabase/supabase-js";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("auth:wallet-link-map");

export const WALLET_LINK_CONFLICT_CODE =
  "WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP";

export type WalletLinkClaimResult =
  | { ok: true; walletAddress: `0x${string}`; privyUserId: string }
  | {
      ok: false;
      code: typeof WALLET_LINK_CONFLICT_CODE;
      walletAddress: `0x${string}`;
      message: string;
    };

function normalizeWalletAddressOrThrow(walletAddress: string): `0x${string}` {
  const normalized = walletAddress.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
    throw new Error("Invalid wallet address format");
  }
  return normalized as `0x${string}`;
}

/**
 * Claim (or validate) the immutable wallet→Privy DID mapping.
 *
 * Contract:
 * - Idempotent: same wallet + same user is always OK.
 * - Conflict: same wallet + different user returns WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP.
 * - Race-safe: handles concurrent claims via INSERT + 23505 fallback re-read.
 *
 * IMPORTANT: Call this ONLY AFTER Privy has verified the wallet is currently linked
 * to the requesting Privy user. This avoids trusting client-supplied wallet lists.
 */
export async function claimOrValidateWalletLink({
  supabase,
  walletAddress,
  privyUserId,
  source,
}: {
  supabase: SupabaseClient;
  walletAddress: string;
  privyUserId: string;
  source: string;
}): Promise<WalletLinkClaimResult> {
  const normalized = normalizeWalletAddressOrThrow(walletAddress);

  // Fast path: does this wallet already have an owner?
  const { data: existing, error: readErr } = await supabase
    .from("wallet_link_map")
    .select("wallet_address, privy_user_id")
    .eq("wallet_address", normalized)
    .maybeSingle();

  if (readErr) {
    log.error("wallet_link_map read failed", {
      walletAddress: normalized,
      privyUserId,
      source,
      error: readErr,
    });
    throw readErr;
  }

  if (existing?.privy_user_id && existing.privy_user_id !== privyUserId) {
    return {
      ok: false,
      code: WALLET_LINK_CONFLICT_CODE,
      walletAddress: normalized,
      message:
        "This wallet can’t be used with this account. Please reconnect it to the account that originally linked it, or contact support.",
    };
  }

  // Touch existing mapping (idempotent)
  if (existing?.privy_user_id === privyUserId) {
    const nowIso = new Date().toISOString();
    const { error: touchErr } = await supabase
      .from("wallet_link_map")
      .update({
        last_seen_at: nowIso,
        source,
        updated_at: nowIso,
      })
      .eq("wallet_address", normalized)
      .eq("privy_user_id", privyUserId);

    if (touchErr) {
      log.error("wallet_link_map touch failed", {
        walletAddress: normalized,
        privyUserId,
        source,
        error: touchErr,
      });
      throw touchErr;
    }

    return { ok: true, walletAddress: normalized, privyUserId };
  }

  // Insert new mapping claim
  const nowIso = new Date().toISOString();
  const { error: insertErr } = await supabase.from("wallet_link_map").insert({
    wallet_address: normalized,
    privy_user_id: privyUserId,
    first_linked_at: nowIso,
    last_seen_at: nowIso,
    source,
    created_at: nowIso,
    updated_at: nowIso,
  });

  if (!insertErr) {
    return { ok: true, walletAddress: normalized, privyUserId };
  }

  // Race-safe fallback: if insert conflicted, re-read and resolve
  if (insertErr.code === "23505") {
    const { data: raced, error: racedReadErr } = await supabase
      .from("wallet_link_map")
      .select("wallet_address, privy_user_id")
      .eq("wallet_address", normalized)
      .maybeSingle();

    if (racedReadErr) {
      log.error("wallet_link_map re-read after conflict failed", {
        walletAddress: normalized,
        privyUserId,
        source,
        error: racedReadErr,
      });
      throw racedReadErr;
    }

    if (raced?.privy_user_id === privyUserId) {
      return { ok: true, walletAddress: normalized, privyUserId };
    }

    if (raced?.privy_user_id && raced.privy_user_id !== privyUserId) {
      return {
        ok: false,
        code: WALLET_LINK_CONFLICT_CODE,
        walletAddress: normalized,
        message:
          "This wallet can’t be used with this account. Please reconnect it to the account that originally linked it, or contact support.",
      };
    }

    // If the row still isn't visible, surface DB error so callers can retry.
    throw insertErr;
  }

  log.error("wallet_link_map insert failed", {
    walletAddress: normalized,
    privyUserId,
    source,
    error: insertErr,
  });
  throw insertErr;
}
