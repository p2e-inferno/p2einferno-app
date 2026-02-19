import type { SupabaseClient } from "@supabase/supabase-js";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("gooddollar:verification-ownership");

export const GOODDOLLAR_OWNERSHIP_CONFLICT_CODE =
  "WALLET_ALREADY_VERIFIED_BY_OTHER_USER";
export const GOODDOLLAR_USER_WALLET_LOCKED_CODE =
  "USER_ALREADY_HAS_VERIFIED_WALLET";

type OwnershipResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | typeof GOODDOLLAR_OWNERSHIP_CONFLICT_CODE
        | typeof GOODDOLLAR_USER_WALLET_LOCKED_CODE;
      message: string;
    };

interface ClaimParams {
  supabase: SupabaseClient;
  walletAddress: `0x${string}`;
  privyUserId: string;
  proofHash: string;
  source?: string;
}

/**
 * Claim wallet ownership for GoodDollar verification.
 *
 * Rules:
 * - One wallet can only map to one Privy user.
 * - One Privy user can only map to one verified wallet.
 * - Idempotent for retries by the same user/wallet.
 */
export async function claimOrValidateVerifiedWalletOwnership({
  supabase,
  walletAddress,
  privyUserId,
  proofHash,
  source = "callback",
}: ClaimParams): Promise<OwnershipResult> {
  // Check wallet ownership first (fast path)
  const { data: existingWalletOwner, error: ownerError } = await supabase
    .from("gooddollar_verified_wallet_map")
    .select("wallet_address, privy_user_id")
    .eq("wallet_address", walletAddress)
    .maybeSingle();

  if (ownerError) {
    log.error("Failed reading wallet ownership mapping", {
      walletAddress,
      privyUserId,
      error: ownerError,
    });
    throw ownerError;
  }

  if (
    existingWalletOwner &&
    existingWalletOwner.privy_user_id &&
    existingWalletOwner.privy_user_id !== privyUserId
  ) {
    return {
      ok: false,
      code: GOODDOLLAR_OWNERSHIP_CONFLICT_CODE,
      message: `Wallet ${walletAddress} has already been used to verify another account in this app.`,
    };
  }

  // Ensure one verified wallet per app account
  const { data: existingUserWallet, error: userWalletError } = await supabase
    .from("gooddollar_verified_wallet_map")
    .select("wallet_address, privy_user_id")
    .eq("privy_user_id", privyUserId)
    .maybeSingle();

  if (userWalletError) {
    log.error("Failed reading user verification mapping", {
      walletAddress,
      privyUserId,
      error: userWalletError,
    });
    throw userWalletError;
  }

  if (
    existingUserWallet &&
    existingUserWallet.wallet_address &&
    existingUserWallet.wallet_address !== walletAddress
  ) {
    return {
      ok: false,
      code: GOODDOLLAR_USER_WALLET_LOCKED_CODE,
      message: `Your account is already verified with ${existingUserWallet.wallet_address}.`,
    };
  }

  // Idempotent update for same row, otherwise insert
  if (existingWalletOwner && existingWalletOwner.privy_user_id === privyUserId) {
    const { error: touchError } = await supabase
      .from("gooddollar_verified_wallet_map")
      .update({
        last_seen_at: new Date().toISOString(),
        proof_hash: proofHash,
        source,
        updated_at: new Date().toISOString(),
      })
      .eq("wallet_address", walletAddress)
      .eq("privy_user_id", privyUserId);

    if (touchError) {
      log.error("Failed updating existing verification mapping", {
        walletAddress,
        privyUserId,
        error: touchError,
      });
      throw touchError;
    }

    return { ok: true };
  }

  // New mapping claim
  const nowIso = new Date().toISOString();
  const { error: insertError } = await supabase
    .from("gooddollar_verified_wallet_map")
    .insert({
      wallet_address: walletAddress,
      privy_user_id: privyUserId,
      first_verified_at: nowIso,
      last_seen_at: nowIso,
      proof_hash: proofHash,
      source,
      created_at: nowIso,
      updated_at: nowIso,
    });

  if (!insertError) {
    return { ok: true };
  }

  // Race-safe fallback: if insert conflicted, re-read and resolve deterministically
  if (insertError.code === "23505") {
    const { data: racedWalletOwner, error: racedReadError } = await supabase
      .from("gooddollar_verified_wallet_map")
      .select("wallet_address, privy_user_id")
      .eq("wallet_address", walletAddress)
      .maybeSingle();

    if (racedReadError) {
      log.error("Failed reading mapping after insert conflict", {
        walletAddress,
        privyUserId,
        error: racedReadError,
      });
      throw racedReadError;
    }

    if (racedWalletOwner?.privy_user_id === privyUserId) {
      return { ok: true };
    }

    if (
      racedWalletOwner?.privy_user_id &&
      racedWalletOwner.privy_user_id !== privyUserId
    ) {
      return {
        ok: false,
        code: GOODDOLLAR_OWNERSHIP_CONFLICT_CODE,
        message: `Wallet ${walletAddress} has already been used to verify another account in this app.`,
      };
    }

    const { data: racedUserWallet, error: racedUserReadError } = await supabase
      .from("gooddollar_verified_wallet_map")
      .select("wallet_address, privy_user_id")
      .eq("privy_user_id", privyUserId)
      .maybeSingle();

    if (racedUserReadError) {
      log.error("Failed reading user mapping after insert conflict", {
        walletAddress,
        privyUserId,
        error: racedUserReadError,
      });
      throw racedUserReadError;
    }

    if (
      racedUserWallet?.wallet_address &&
      racedUserWallet.wallet_address !== walletAddress
    ) {
      return {
        ok: false,
        code: GOODDOLLAR_USER_WALLET_LOCKED_CODE,
        message: `Your account is already verified with ${racedUserWallet.wallet_address}.`,
      };
    }

    // Conflict happened but neither ownership row is visible yet; surface the DB error
    // so the caller can retry and resolve once writes are committed.
    throw insertError;
  }

  log.error("Failed inserting verification wallet mapping", {
    walletAddress,
    privyUserId,
    error: insertError,
  });
  throw insertError;
}
