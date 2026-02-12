import { NextApiRequest, NextApiResponse } from "next";
import {
  getPrivyUser,
  extractAndValidateWalletFromHeader,
} from "@/lib/auth/privy";
import { createAdminClient } from "@/lib/supabase/server";
import { grantKeyToUser } from "@/lib/services/user-key-service";
import { createWalletClientUnified } from "@/lib/blockchain/config/clients/wallet-client";
import { createPublicClientUnified } from "@/lib/blockchain/config/clients/public-client";
import { getLogger } from "@/lib/utils/logger";
import { Address } from "viem";
import { checkAndUpdateMilestoneKeyClaimStatus } from "@/lib/helpers/checkAndUpdateMilestoneKeyClaimStatus";
import { isEASEnabled } from "@/lib/attestation/core/config";
import type {
  DelegatedAttestationSignature,
  SchemaFieldData,
} from "@/lib/attestation/api/types";
import {
  handleGaslessAttestation,
  extractAndValidateWalletFromSignature,
} from "@/lib/attestation/api/helpers";
import { buildEasScanLink } from "@/lib/attestation/core/network-config";
import { checkUserKeyOwnership } from "@/lib/services/user-key-service";
import { extractTokenTransfers } from "@/lib/blockchain/shared/transaction-utils";
import {
  decodeAttestationDataFromDb,
  getDecodedFieldValue,
  normalizeBytes32,
  normalizeUint,
} from "@/lib/attestation/api/commit-guards";
import { getDefaultNetworkName } from "@/lib/attestation/core/network-config";

const log = getLogger("api:milestones:claim");

function buildMilestoneAchievementSchemaData(params: {
  milestoneId: string;
  milestoneTitle: string;
  userAddress: string;
  cohortLockAddress: string;
  milestoneLockAddress: string;
  keyTokenId: bigint;
  grantTxHash: string;
  achievementDate: bigint;
  xpEarned: bigint;
  skillLevel?: string;
}): SchemaFieldData[] {
  return [
    { name: "milestoneId", type: "string", value: params.milestoneId },
    { name: "milestoneTitle", type: "string", value: params.milestoneTitle },
    { name: "userAddress", type: "address", value: params.userAddress },
    {
      name: "cohortLockAddress",
      type: "address",
      value: params.cohortLockAddress,
    },
    {
      name: "milestoneLockAddress",
      type: "address",
      value: params.milestoneLockAddress,
    },
    {
      name: "keyTokenId",
      type: "uint256",
      value: params.keyTokenId.toString(),
    },
    { name: "grantTxHash", type: "bytes32", value: params.grantTxHash },
    {
      name: "achievementDate",
      type: "uint256",
      value: params.achievementDate.toString(),
    },
    { name: "xpEarned", type: "uint256", value: params.xpEarned.toString() },
    { name: "skillLevel", type: "string", value: params.skillLevel ?? "" },
  ];
}

/**
 * API handler for a user to claim their milestone key.
 * This endpoint performs server-side validation and initiates a gasless key granting transaction.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const user = await getPrivyUser(req);
    if (!user?.id) {
      return res
        .status(401)
        .json({ error: "Unauthorized: User not authenticated." });
    }

    const { milestoneId, attestationSignature } = (req.body || {}) as {
      milestoneId?: string;
      attestationSignature?: DelegatedAttestationSignature | null;
    };
    if (!milestoneId) {
      return res
        .status(400)
        .json({ error: "Bad Request: milestoneId is required." });
    }

    // For initial grant path (no attestationSignature), validate X-Active-Wallet header early
    // This fails fast before expensive DB queries if header is missing
    if (!attestationSignature) {
      const activeWalletHeader = req.headers["x-active-wallet"];
      if (!activeWalletHeader) {
        return res.status(400).json({
          error: "X-Active-Wallet header is required",
        });
      }
    }

    const supabase = createAdminClient();

    // 1. Fetch user profile to get the internal user_profile_id
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("privy_user_id", user.id)
      .single();

    if (!profile) {
      return res.status(404).json({ error: "User profile not found." });
    }

    // Get wallet address - extract from signature if commit path, otherwise from header or Privy
    let walletAddress: string | null = null;

    // 2. Verify the milestone is actually completed in the database for this user
    const { data: milestoneProgress } = await supabase
      .from("user_milestone_progress")
      .select(
        `
        status,
        completed_at,
        reward_amount,
        key_claim_attestation_uid,
        key_claim_tx_hash,
        key_claim_token_id,
        milestone:milestone_id (
          cohort_id,
          name,
          lock_address,
          cohort:cohort_id (
            lock_address
          )
        )
      `,
      )
      .eq("milestone_id", milestoneId)
      .eq("user_profile_id", profile.id)
      .single();

    if (!milestoneProgress) {
      return res
        .status(404)
        .json({ error: "Milestone progress not found for this user." });
    }

    if (milestoneProgress.status !== "completed") {
      return res
        .status(403)
        .json({ error: "Forbidden: Milestone tasks are not completed yet." });
    }

    const milestoneRow = milestoneProgress.milestone as any;
    const lockAddress = milestoneRow?.lock_address as string | null | undefined;
    if (!lockAddress) {
      return res
        .status(500)
        .json({ error: "Milestone is not configured with a lock address." });
    }

    const existingUid = (milestoneProgress as any)
      ?.key_claim_attestation_uid as string | null | undefined;

    // Commit-only path: client sends attestationSignature after a successful claim
    if (attestationSignature) {
      // Extract and validate wallet from attestation signature
      try {
        walletAddress = await extractAndValidateWalletFromSignature({
          userId: user.id,
          attestationSignature,
          context: "milestone-achievement-claim",
        });
      } catch (error: any) {
        const status = error.message?.includes("required") ? 400 : 403;
        return res.status(status).json({ error: error.message });
      }

      if (!isEASEnabled()) {
        return res.status(200).json({
          success: true,
          attestationUid: null,
          attestationScanUrl: null,
        });
      }

      if (existingUid) {
        return res.status(200).json({
          success: true,
          attestationUid: existingUid,
          attestationScanUrl: await buildEasScanLink(existingUid),
        });
      }

      if (!walletAddress) {
        return res.status(400).json({ error: "Wallet not found" });
      }

      const decoded = await decodeAttestationDataFromDb({
        supabase,
        schemaKey: "milestone_achievement",
        network: getDefaultNetworkName(),
        encodedData: attestationSignature.data,
      });

      if (!decoded) {
        return res.status(400).json({ error: "Invalid attestation payload" });
      }

      const decodedGrantTxHash = normalizeBytes32(
        getDecodedFieldValue(decoded, "grantTxHash"),
      );
      const decodedTokenId = normalizeUint(
        getDecodedFieldValue(decoded, "keyTokenId"),
      );

      const expectedGrantTxHash = normalizeBytes32(
        (milestoneProgress as any)?.key_claim_tx_hash,
      );
      const expectedTokenId = normalizeUint(
        (milestoneProgress as any)?.key_claim_token_id,
      );

      if (!expectedGrantTxHash || expectedTokenId === null) {
        return res.status(400).json({
          error: "Grant details not recorded for this milestone claim",
        });
      }

      if (
        !decodedGrantTxHash ||
        !decodedTokenId ||
        decodedGrantTxHash !== expectedGrantTxHash ||
        decodedTokenId !== expectedTokenId
      ) {
        return res.status(400).json({
          error: "Attestation payload does not match recorded grant details",
        });
      }

      const attestationResult = await handleGaslessAttestation({
        signature: attestationSignature,
        schemaKey: "milestone_achievement",
        recipient: walletAddress,
        // On-chain action already happened; do not block on EAS failures.
        gracefulDegrade: true,
      });

      if (!attestationResult.success || !attestationResult.uid) {
        return res.status(200).json({
          success: true,
          attestationUid: null,
          attestationScanUrl: null,
        });
      }

      const uid = attestationResult.uid;
      const attestationScanUrl = await buildEasScanLink(uid);

      const { error: keyAttErr } = await supabase
        .from("user_milestone_progress")
        .update({ key_claim_attestation_uid: uid })
        .eq("milestone_id", milestoneId)
        .eq("user_profile_id", profile.id);

      if (keyAttErr) {
        log.error("Failed to persist milestone key claim attestation UID", {
          milestoneId,
          userProfileId: profile.id,
          keyClaimAttestationUid: uid,
          error: keyAttErr,
        });
      }

      return res.status(200).json({
        success: true,
        attestationUid: uid,
        attestationScanUrl,
      });
    }

    // Initial grant path - get wallet from X-Active-Wallet header (REQUIRED)
    try {
      walletAddress = await extractAndValidateWalletFromHeader({
        userId: user.id,
        activeWalletHeader: req.headers["x-active-wallet"] as
          | string
          | undefined,
        context: "milestone-grant",
        required: true, // No fallback - client must send the header
      });
    } catch (error: any) {
      const status = error.message?.includes("required") ? 400 : 403;
      return res.status(status).json({ error: error.message });
    }

    // 3. Create wallet client and grant the key
    const walletClient = createWalletClientUnified();
    if (!walletClient) {
      return res.status(500).json({
        error: "Server wallet not configured for key granting",
      });
    }

    const publicClient = createPublicClientUnified();
    log.info(
      `Attempting to grant key for lock ${lockAddress} to user ${user.id}`,
    );
    const grantResult = await grantKeyToUser(
      walletClient,
      publicClient,
      user.id,
      lockAddress,
    );

    if (!grantResult.success) {
      log.error(
        `Key grant failed for user ${user.id} on lock ${lockAddress}:`,
        grantResult.error,
      );
      const raw = grantResult.error || "";
      const errorMessage = raw.includes("LOCK_MANAGER_PRIVATE_KEY")
        ? "Server is not configured for on-chain grants yet. Please try again later."
        : raw.toLowerCase().includes("no contract exists")
          ? "This milestone's lock address is not valid on the current network. Please contact support."
          : raw.toLowerCase().includes("no wallet")
            ? "No wallet found. Please connect a wallet to claim your milestone key."
            : raw.toLowerCase().includes("already has a valid key")
              ? "You already have a key for this milestone."
              : "Failed to grant key on-chain. Please try again or contact support.";
      return res
        .status(500)
        .json({ error: errorMessage, details: grantResult.error });
    }

    log.info(
      `Successfully granted key for lock ${lockAddress} to user ${user.id}. Tx: ${grantResult.transactionHash}`,
    );

    // After grant: extract tokenId from receipt (quest completion pattern).
    let keyTokenId = 0n;
    const transactionHash = grantResult.transactionHash;
    if (
      transactionHash &&
      typeof publicClient?.waitForTransactionReceipt === "function"
    ) {
      try {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: transactionHash as `0x${string}`,
          confirmations: 1,
        });
        const transfers = extractTokenTransfers(receipt);
        const normalizedWallet = (walletAddress || "").toLowerCase();
        const matching = transfers.find(
          (t) => t.to.toLowerCase() === normalizedWallet,
        );
        if (matching) {
          keyTokenId = matching.tokenId;
        } else if (transfers.length > 0) {
          keyTokenId = transfers[0]!.tokenId;
        }
      } catch (error: any) {
        log.warn("Failed to extract tokenId from milestone key grant receipt", {
          milestoneId,
          transactionHash,
          error: error?.message || String(error),
        });
      }
    }

    if (!keyTokenId) {
      const keyInfo = await checkUserKeyOwnership(
        publicClient,
        user.id,
        lockAddress,
      );
      keyTokenId = keyInfo.keyInfo?.tokenId ?? 0n;
    }
    const keyClaimTxHash =
      grantResult.transactionHash ||
      "0x0000000000000000000000000000000000000000000000000000000000000000";

    const { error: grantMetaError } = await supabase
      .from("user_milestone_progress")
      .update({
        key_claim_tx_hash: keyClaimTxHash,
        key_claim_token_id: keyTokenId.toString(),
      })
      .eq("milestone_id", milestoneId)
      .eq("user_profile_id", profile.id);

    if (grantMetaError) {
      log.error("Failed to persist milestone key grant metadata", {
        milestoneId,
        userProfileId: profile.id,
        keyClaimTxHash,
        keyClaimTokenId: keyTokenId.toString(),
        error: grantMetaError,
      });
    }

    const cohortId = milestoneRow?.cohort_id as string | null | undefined;
    let cohortLockAddress = (milestoneRow as any)?.cohort?.lock_address as
      | string
      | null
      | undefined;

    if (!cohortLockAddress && cohortId) {
      const { data: cohortRow } = await supabase
        .from("cohorts")
        .select("lock_address")
        .eq("id", cohortId)
        .maybeSingle();
      const raw = (cohortRow as any)?.lock_address;
      if (typeof raw === "string" && raw.length > 0) {
        cohortLockAddress = raw;
      }
    }

    if (!cohortLockAddress) {
      log.warn("Cohort lock address missing for milestone claim", {
        milestoneId,
        cohortId,
      });
      cohortLockAddress = "0x0000000000000000000000000000000000000000";
    }

    const achievementDate = BigInt(
      milestoneProgress?.completed_at
        ? Math.floor(new Date(milestoneProgress.completed_at).getTime() / 1000)
        : Math.floor(Date.now() / 1000),
    );
    const xpEarned = BigInt(Number(milestoneProgress?.reward_amount || 0));

    const attestationPayload =
      isEASEnabled() && walletAddress
        ? {
            schemaKey: "milestone_achievement",
            recipient: walletAddress,
            schemaData: buildMilestoneAchievementSchemaData({
              milestoneId,
              milestoneTitle:
                typeof milestoneRow?.name === "string" ? milestoneRow.name : "",
              userAddress: walletAddress,
              cohortLockAddress,
              milestoneLockAddress: lockAddress,
              keyTokenId,
              grantTxHash: keyClaimTxHash,
              achievementDate,
              xpEarned,
              skillLevel: "",
            }),
          }
        : null;

    // 4. Verify key ownership on-chain and update database tracking (if feature enabled)
    let keyVerified = false;
    const enableKeyTracking =
      process.env.MILESTONE_KEY_TRACKING_ENABLED === "true";

    if (enableKeyTracking) {
      keyVerified = await checkAndUpdateMilestoneKeyClaimStatus(
        milestoneId,
        user.id,
        publicClient,
        lockAddress as Address,
        supabase,
      );
    } else {
      log.debug(
        `Milestone key tracking is disabled for milestone ${milestoneId}`,
      );
    }

    res.status(200).json({
      success: true,
      transactionHash: grantResult.transactionHash,
      keyTokenId: keyTokenId.toString(),
      keyVerified,
      attestationRequired: !!attestationPayload,
      attestationPayload,
    });
  } catch (error: any) {
    log.error("Error in /api/milestones/claim:", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
}
