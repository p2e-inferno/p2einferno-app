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

interface ResolveCandidateParams {
  supabase: SupabaseClient;
  privyUserId: string;
  linkedWallets: string[];
  preferredWallet?: string | null;
}

interface VerifiedWalletMapRow {
  wallet_address: string | null;
  privy_user_id?: string | null;
}

export interface GoodDollarVerifiedWalletOwnershipState {
  walletOwner: VerifiedWalletMapRow | null;
  userWallet: VerifiedWalletMapRow | null;
}

function normalizeWalletAddress(value: string): `0x${string}` | null {
  const trimmed = value.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return null;
  return trimmed.toLowerCase() as `0x${string}`;
}

function dedupeWallets(values: Array<string | null | undefined>): `0x${string}`[] {
  const seen = new Set<string>();
  const result: `0x${string}`[] = [];

  for (const value of values) {
    if (!value) continue;
    const normalized = normalizeWalletAddress(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export async function getGoodDollarVerifiedWalletOwnershipState(params: {
  supabase: SupabaseClient;
  walletAddress: `0x${string}`;
  privyUserId: string;
}): Promise<GoodDollarVerifiedWalletOwnershipState> {
  const { supabase, walletAddress, privyUserId } = params;

  const [
    { data: walletOwner, error: ownerError },
    { data: userWallet, error: userWalletError },
  ] = await Promise.all([
    supabase
      .from("gooddollar_verified_wallet_map")
      .select("wallet_address, privy_user_id")
      .eq("wallet_address", walletAddress)
      .maybeSingle(),
    supabase
      .from("gooddollar_verified_wallet_map")
      .select("wallet_address, privy_user_id")
      .eq("privy_user_id", privyUserId)
      .maybeSingle(),
  ]);

  if (ownerError) {
    log.error("Failed reading wallet ownership mapping", {
      walletAddress,
      privyUserId,
      error: ownerError,
    });
    throw ownerError;
  }
  if (userWalletError) {
    log.error("Failed reading user verification mapping", {
      walletAddress,
      privyUserId,
      error: userWalletError,
    });
    throw userWalletError;
  }

  return {
    walletOwner: walletOwner ?? null,
    userWallet: userWallet ?? null,
  };
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
  const ownership = await getGoodDollarVerifiedWalletOwnershipState({
    supabase,
    walletAddress,
    privyUserId,
  });
  const existingWalletOwner = ownership.walletOwner;
  const existingUserWallet = ownership.userWallet;

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

/**
 * Resolve the safe wallet candidates to use for GoodDollar verification checks.
 *
 * Rules:
 * - Only linked wallets are eligible.
 * - If the user already has a claimed verified wallet in-app, that wallet is authoritative.
 * - Otherwise, exclude linked wallets that are already claimed by another app user.
 */
export async function resolveSafeGoodDollarWalletCandidates({
  supabase,
  privyUserId,
  linkedWallets,
  preferredWallet,
}: ResolveCandidateParams): Promise<`0x${string}`[]> {
  const normalizedLinkedWallets = dedupeWallets(linkedWallets);
  const normalizedPreferredWallet = preferredWallet
    ? normalizeWalletAddress(preferredWallet)
    : null;
  const orderedLinkedWallets = dedupeWallets([
    normalizedLinkedWallets.includes(
      normalizedPreferredWallet as `0x${string}`,
    )
      ? normalizedPreferredWallet
      : null,
    ...normalizedLinkedWallets,
  ]);
  if (orderedLinkedWallets.length === 0) return [];
  const probeWallet = orderedLinkedWallets[0]!;

  const ownership = await getGoodDollarVerifiedWalletOwnershipState({
    supabase,
    walletAddress: probeWallet,
    privyUserId,
  });
  const mappedWallet = normalizeWalletAddress(
    ownership.userWallet?.wallet_address ?? "",
  );

  if (mappedWallet) {
    return orderedLinkedWallets.includes(mappedWallet) ? [mappedWallet] : [];
  }

  const { data: claimedWalletRows, error: claimedWalletsError } = await supabase
    .from("gooddollar_verified_wallet_map")
    .select("wallet_address")
    .in("wallet_address", orderedLinkedWallets)
    .neq("privy_user_id", privyUserId);

  if (claimedWalletsError) {
    log.error("Failed reading linked wallet ownership mappings", {
      privyUserId,
      linkedWallets: orderedLinkedWallets,
      error: claimedWalletsError,
    });
    throw claimedWalletsError;
  }

  const conflictingWallets = new Set(
    (claimedWalletRows || [])
      .filter((row) => row?.wallet_address)
      .map((row) => String(row.wallet_address).toLowerCase()),
  );

  return orderedLinkedWallets.filter(
    (wallet) => !conflictingWallets.has(wallet.toLowerCase()),
  );
}
