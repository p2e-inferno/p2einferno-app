import type { NextApiRequest, NextApiResponse } from "next";
import {
  getPrivyUser,
  extractAndValidateWalletFromHeader,
  validateWalletOwnership,
} from "@/lib/auth/privy";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { isEASEnabled } from "@/lib/attestation/core/config";
import { resolveSchemaUID } from "@/lib/attestation/schemas/network-resolver";
import { getDefaultNetworkName } from "@/lib/attestation/core/network-config";
import { createDelegatedAttestation } from "@/lib/attestation/core/delegated";
import type { DelegatedAttestationCheckinSignature } from "@/hooks/checkin/useDelegatedAttestationCheckin";
import { getDefaultCheckinService } from "@/lib/checkin";

const log = getLogger("api:checkin");

const isTruthyEnv = (v: unknown): boolean =>
  typeof v === "string" && /^(1|true|yes)$/i.test(v);

const shouldGracefullyDegradeEASFailures = (): boolean =>
  isTruthyEnv(process.env.CHECKIN_EAS_GRACEFUL_DEGRADE);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await getPrivyUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      userProfileId,
      xpAmount: _xpAmount,
      activityData,
      attestation,
      attestationSignature,
    } = (req.body || {}) as {
      userProfileId?: string;
      xpAmount?: number;
      activityData?: any;
      attestation?: {
        uid?: string;
        schemaUid?: string;
        attester?: string;
        recipient?: string;
        data?: any;
        expirationTime?: number;
      } | null;
      attestationSignature?: DelegatedAttestationCheckinSignature | null;
    };

    if (!userProfileId) {
      return res.status(400).json({ error: "userProfileId is required" });
    }

    const supabase = createAdminClient();
    const checkinService = getDefaultCheckinService();

    type PerformDailyCheckinResult = {
      ok: boolean;
      conflict: boolean;
      new_xp: number | null;
    };

    // Verify the profile belongs to this Privy user
    const { data: profile, error: profErr } = await supabase
      .from("user_profiles")
      .select("id, privy_user_id, experience_points")
      .eq("id", userProfileId)
      .single();
    if (profErr || !profile) {
      return res.status(404).json({ error: "Profile not found" });
    }
    if (profile.privy_user_id !== user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Extract and validate wallet address
    // If attestationSignature is provided (EAS enabled), use its recipient
    // Otherwise (EAS disabled), use X-Active-Wallet header
    let userWalletAddress: string;

    if (attestationSignature?.recipient) {
      // Validate the recipient wallet belongs to this user
      try {
        await validateWalletOwnership(
          user.id,
          attestationSignature.recipient,
          "checkin",
        );
        userWalletAddress = attestationSignature.recipient;
      } catch (error: any) {
        return res.status(403).json({ error: error.message });
      }
    } else {
      // EAS disabled or no signature - use X-Active-Wallet header
      try {
        const headerWallet = await extractAndValidateWalletFromHeader({
          userId: user.id,
          activeWalletHeader: req.headers["x-active-wallet"] as
            | string
            | undefined,
          context: "checkin",
          required: true,
        });
        if (!headerWallet) {
          return res.status(400).json({ error: "X-Active-Wallet is required" });
        }
        userWalletAddress = headerWallet;
      } catch (error: any) {
        const status = error.message?.includes("required") ? 400 : 403;
        return res.status(status).json({ error: error.message });
      }
    }

    // Server-authoritative: ignore client xpAmount and compute using the same logic as the service preview.
    // NOTE: Do NOT call checkinService.performCheckin() here; it can recurse back into /api/checkin via xpUpdater.
    const canCheckin = await checkinService.canCheckinToday(userWalletAddress);
    if (!canCheckin) {
      const preview = await checkinService.getCheckinPreview(userWalletAddress);
      return res.status(409).json({
        success: false,
        error: "Already checked in today",
        xpEarned: 0,
        newStreak: preview.currentStreak,
        attestationUid: null,
      });
    }

    const preview = await checkinService.getCheckinPreview(userWalletAddress);
    const xpEarned = preview.breakdown.totalXP;
    const newStreak = preview.nextStreak;
    const breakdown = preview.breakdown;
    const multiplier = preview.nextMultiplier;
    const tierInfo = checkinService.getCurrentTier(newStreak);

    const greeting =
      (typeof activityData?.greeting === "string" && activityData.greeting) ||
      "GM";

    // Create gasless delegated attestation if signature provided and EAS enabled
    let finalAttestation: any = attestation || null;

    const easEnabled = isEASEnabled();
    const degradeEas = shouldGracefullyDegradeEASFailures();

    // require a delegated signature so the API can mint on-chain attestations.
    if (easEnabled && !finalAttestation && !attestationSignature) {
      if (degradeEas) {
        log.warn(
          "EAS enabled but no attestationSignature provided; continuing without attestation",
        );
      } else {
        return res.status(400).json({
          error: "attestationSignature is required to check-in",
        });
      }
    }

    if (easEnabled && attestationSignature && !attestation) {
      try {
        log.info("Creating delegated check-in attestation", {
          userProfileId,
          recipient: userWalletAddress,
        });

        // Resolve schema UID from DB or env
        const resolvedNetwork = getDefaultNetworkName();
        const resolvedSchemaUid = await resolveSchemaUID(
          "daily_checkin",
          resolvedNetwork,
        );

        if (!resolvedSchemaUid) {
          const message =
            "Daily check-in schema UID not configured; cannot mint EAS attestation";
          if (degradeEas) {
            log.warn(message, { network: resolvedNetwork });
          } else {
            return res.status(500).json({ error: message });
          }
        } else {
          // Create delegated attestation using service wallet
          const attestationResult = await createDelegatedAttestation({
            schemaUid: resolvedSchemaUid,
            recipient: attestationSignature.recipient,
            data: attestationSignature.data,
            signature: attestationSignature.signature,
            deadline: attestationSignature.deadline,
            chainId: attestationSignature.chainId,
            expirationTime: attestationSignature.expirationTime,
            revocable: attestationSignature.revocable,
            refUID: attestationSignature.refUID,
          });

          if (attestationResult.success && attestationResult.uid) {
            log.info("Delegated attestation created successfully", {
              uid: attestationResult.uid,
              txHash: attestationResult.txHash,
              userProfileId,
            });

            // Build attestation object with real UID for database
            finalAttestation = {
              uid: attestationResult.uid,
              schemaUid: resolvedSchemaUid,
              attester: attestationSignature.attester,
              recipient: attestationSignature.recipient,
              data: {
                platform: "P2E Inferno Gasless",
                txHash: attestationResult.txHash,
              },
              expirationTime: Number(attestationSignature.expirationTime),
            };
          } else {
            const message =
              attestationResult.error ||
              "Failed to create delegated attestation";
            log.error("Failed to create delegated attestation", {
              error: message,
              userProfileId,
            });
            if (!degradeEas) {
              return res.status(500).json({ error: message });
            }
          }
        }
      } catch (error: any) {
        const message =
          error?.message || "Failed to create delegated attestation";
        log.error("Exception during delegated attestation creation", {
          error: message,
          userProfileId,
        });
        if (!degradeEas) {
          return res.status(500).json({ error: message });
        }
      }
    }

    const nowIso = new Date().toISOString();
    const enrichedActivityData = {
      greeting,
      streak: newStreak,
      attestationUid: finalAttestation?.uid || undefined,
      xpBreakdown: breakdown,
      multiplier,
      tierInfo,
      timestamp: nowIso,
      activityType: "daily_checkin" as const,
    };

    // Atomic check-in via RPC: insert activity then update XP
    const txResp = await supabase
      .rpc("perform_daily_checkin", {
        p_user_profile_id: userProfileId,
        p_xp_amount: xpEarned,
        p_activity_data: enrichedActivityData,
        p_attestation: finalAttestation,
      })
      .single();

    const txData = txResp.data as PerformDailyCheckinResult | null;
    const txErr = txResp.error as any;

    if (txErr || !txData) {
      log.error("perform_daily_checkin RPC failed", {
        txErr,
        code: (txErr as any)?.code,
        message: txErr?.message,
        details: (txErr as any)?.details,
        hint: (txErr as any)?.hint,
        txData,
      });
      return res.status(500).json({ error: "Failed to perform check-in" });
    }

    if (txData.conflict) {
      log.warn("Duplicate daily check-in detected by RPC", { userProfileId });
      return res.status(409).json({
        success: false,
        error: "Already checked in today",
        xpEarned: 0,
        newStreak: preview.currentStreak,
        attestationUid: null,
      });
    }

    if (txData.ok === false) {
      log.error("perform_daily_checkin returned not ok without conflict", {
        userProfileId,
        txData,
      });
      return res.status(500).json({ error: "Check-in failed" });
    }

    if (txData.new_xp == null) {
      log.error("perform_daily_checkin returned ok but missing new_xp", {
        userProfileId,
        txData,
      });
      return res.status(500).json({ error: "Check-in result invalid" });
    }

    // Attestation persistence handled inside perform_daily_checkin

    return res.status(200).json({
      success: true,
      xpEarned,
      newStreak,
      breakdown,
      attestationUid: finalAttestation?.uid || null,
    });
  } catch (error: any) {
    log.error("checkin endpoint error", { error });
    return res.status(500).json({ error: "Internal server error" });
  }
}
