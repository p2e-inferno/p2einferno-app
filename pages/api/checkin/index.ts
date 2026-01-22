import type { NextApiRequest, NextApiResponse } from "next";
import { getPrivyUser } from "@/lib/auth/privy";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { isEASEnabled } from "@/lib/attestation/core/config";
import { resolveSchemaUID } from "@/lib/attestation/schemas/network-resolver";
import { getDefaultNetworkName } from "@/lib/attestation/core/network-config";
import { createDelegatedAttestation } from "@/lib/attestation/core/delegated";
import type { DelegatedAttestationCheckinSignature } from "@/hooks/checkin/useDelegatedAttestationCheckin";

const log = getLogger("api:checkin");

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
      xpAmount,
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

    if (!userProfileId || typeof xpAmount !== "number") {
      return res
        .status(400)
        .json({ error: "userProfileId and xpAmount are required" });
    }

    const supabase = createAdminClient();

    type PerformDailyCheckinResult = {
      ok: boolean;
      conflict: boolean;
      new_xp: number | null;
    };

    // Verify the profile belongs to this Privy user
    const { data: profile, error: profErr } = await supabase
      .from("user_profiles")
      .select("id, privy_user_id, experience_points, wallet_address")
      .eq("id", userProfileId)
      .single();
    if (profErr || !profile) {
      return res.status(404).json({ error: "Profile not found" });
    }
    if (profile.privy_user_id !== user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Create gasless delegated attestation if signature provided and EAS enabled
    let finalAttestation: any = attestation || null;

    if (isEASEnabled() && attestationSignature && !attestation) {
      try {
        log.info("Creating delegated check-in attestation", {
          userProfileId,
          recipient: attestationSignature.recipient,
        });

        // Resolve schema UID from DB or env
        const resolvedNetwork = getDefaultNetworkName();
        const resolvedSchemaUid = await resolveSchemaUID(
          "daily_checkin",
          resolvedNetwork,
        );

        if (!resolvedSchemaUid) {
          log.warn(
            "Daily check-in schema UID not configured, skipping attestation",
            {
              network: resolvedNetwork,
            },
          );
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
            log.error("Failed to create delegated attestation", {
              error: attestationResult.error,
              userProfileId,
            });
            // Continue with check-in without attestation (graceful degradation)
          }
        }
      } catch (error: any) {
        log.error("Exception during delegated attestation creation", {
          error: error?.message || "Unknown error",
          userProfileId,
        });
        // Continue with check-in without attestation (graceful degradation)
      }
    }

    // Atomic check-in via RPC: insert activity then update XP
    const txResp = await supabase
      .rpc("perform_daily_checkin", {
        p_user_profile_id: userProfileId,
        p_xp_amount: xpAmount,
        p_activity_data: activityData || {},
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
      return res.status(409).json({ error: "Already checked in today" });
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

    const newXP = txData.new_xp;

    // Attestation persistence handled inside perform_daily_checkin

    return res.status(200).json({
      success: true,
      newXP,
      attestationUid: finalAttestation?.uid || null,
    });
  } catch (error: any) {
    log.error("checkin endpoint error", { error });
    return res.status(500).json({ error: "Internal server error" });
  }
}
