import { NextApiRequest, NextApiResponse } from "next";
import { getPrivyUser } from "@/lib/auth/privy";
import { createAdminClient } from "@/lib/supabase/server";
import { grantKeyToUser } from "@/lib/services/user-key-service";
import { createWalletClientUnified } from "@/lib/blockchain/config/clients/wallet-client";
import { createPublicClientUnified } from "@/lib/blockchain/config/clients/public-client";
import { getLogger } from "@/lib/utils/logger";
import { Address } from "viem";
import { checkAndUpdateMilestoneKeyClaimStatus } from "@/lib/helpers/checkAndUpdateMilestoneKeyClaimStatus";
import { isEASEnabled } from "@/lib/attestation/core/config";
import type { DelegatedAttestationSignature } from "@/lib/attestation/api/types";
import { handleGaslessAttestation } from "@/lib/attestation/api/helpers";
import { buildEasScanLink } from "@/lib/attestation/core/network-config";

const log = getLogger("api:milestones:claim");

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

    const supabase = createAdminClient();

    // 1. Fetch user profile to get the internal user_profile_id
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("id, wallet_address")
      .eq("privy_user_id", user.id)
      .single();

    if (!profile) {
      return res.status(404).json({ error: "User profile not found." });
    }

    const walletAddress =
      typeof (profile as any)?.wallet_address === "string"
        ? ((profile as any).wallet_address as string)
        : null;

    if (isEASEnabled() && walletAddress && !attestationSignature) {
      return res.status(400).json({
        error: "Attestation signature is required",
      });
    }

    // 2. Verify the milestone is actually completed in the database for this user
    const { data: milestoneProgress } = await supabase
      .from("user_milestone_progress")
      .select(
        `
        status,
        milestone:milestone_id (
          lock_address
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

    const lockAddress = (milestoneProgress.milestone as any)?.lock_address;
    if (!lockAddress) {
      return res
        .status(500)
        .json({ error: "Milestone is not configured with a lock address." });
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

    // 3b. Best-effort gasless attestation (on-chain action should not be blocked by EAS issues)
    let keyClaimAttestationUid: string | null = null;
    let attestationScanUrl: string | null = null;

    if (isEASEnabled() && walletAddress && attestationSignature) {
      const attestationResult = await handleGaslessAttestation({
        signature: attestationSignature,
        schemaKey: "milestone_achievement",
        recipient: walletAddress,
        gracefulDegrade: true,
      });

      if (attestationResult.success && attestationResult.uid) {
        keyClaimAttestationUid = attestationResult.uid;
        attestationScanUrl = await buildEasScanLink(keyClaimAttestationUid);

        const { error: keyAttErr } = await supabase
          .from("user_milestone_progress")
          .update({ key_claim_attestation_uid: keyClaimAttestationUid })
          .eq("milestone_id", milestoneId)
          .eq("user_profile_id", profile.id);

        if (keyAttErr) {
          log.error("Failed to persist milestone key claim attestation UID", {
            milestoneId,
            userProfileId: profile.id,
            keyClaimAttestationUid,
            error: keyAttErr,
          });
        }
      }
    }

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
      keyVerified,
      attestationUid: keyClaimAttestationUid,
      attestationScanUrl,
    });
  } catch (error: any) {
    log.error("Error in /api/milestones/claim:", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
}
