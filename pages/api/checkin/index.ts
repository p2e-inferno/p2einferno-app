import type { NextApiRequest, NextApiResponse } from "next";
import { getPrivyUser } from "@/lib/auth/privy";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:checkin");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await getPrivyUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { userProfileId, xpAmount, activityData, attestation } = (req.body ||
      {}) as {
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
    };

    if (!userProfileId || typeof xpAmount !== "number") {
      return res
        .status(400)
        .json({ error: "userProfileId and xpAmount are required" });
    }

    const supabase = createAdminClient();

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

    // Update XP
    const newXP = (profile.experience_points || 0) + xpAmount;
    const { error: upErr } = await supabase
      .from("user_profiles")
      .update({
        experience_points: newXP,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userProfileId);
    if (upErr) {
      log.error("Failed to update XP", { upErr, userProfileId, xpAmount });
      return res.status(500).json({ error: "Failed to update user XP" });
    }

    // Insert activity row (non-blocking if it fails)
    const { error: actErr } = await supabase.from("user_activities").insert({
      user_profile_id: userProfileId,
      activity_type: activityData?.activityType || "daily_checkin",
      activity_data: activityData || {},
      points_earned: xpAmount,
    });
    if (actErr) {
      log.warn("Failed to insert activity record", { actErr, userProfileId });
    }

    // Save attestation DB row (CRITICAL for streak tracking)
    if (attestation?.uid && attestation?.schemaUid) {
      const expirationIso = attestation.expirationTime
        ? new Date(attestation.expirationTime * 1000).toISOString()
        : null;
      
      // Normalize addresses to lowercase to avoid case sensitivity issues
      const normalizedAttester = attestation.attester?.toLowerCase() || '';
      const normalizedRecipient = attestation.recipient?.toLowerCase() || '';
      
      log.info("Inserting attestation", {
        uid: attestation.uid,
        schemaUid: attestation.schemaUid,
        attester: normalizedAttester,
        recipient: normalizedRecipient,
        attesterLength: normalizedAttester.length,
        recipientLength: normalizedRecipient.length,
      });
      
      const { error: attErr } = await supabase.from("attestations").insert({
        attestation_uid: attestation.uid,
        schema_uid: attestation.schemaUid,
        attester: normalizedAttester,
        recipient: normalizedRecipient,
        data: attestation.data || {},
        expiration_time: expirationIso,
      });
      
      if (attErr) {
        // CRITICAL: Attestation failures break streak tracking
        log.error("Failed to insert attestation row - STREAK TRACKING BROKEN", {
          error: attErr,
          code: attErr.code,
          message: attErr.message,
          details: attErr.details,
          hint: attErr.hint,
          attestation: {
            uid: attestation.uid,
            schemaUid: attestation.schemaUid,
            attester: normalizedAttester,
            recipient: normalizedRecipient,
          },
        });
        // Consider this a warning for now, but log prominently
        // Future: may want to return error to client
      } else {
        log.info("Attestation inserted successfully", {
          uid: attestation.uid,
          recipient: normalizedRecipient,
        });
      }
    } else {
      log.warn("No attestation data provided - streak tracking may not work", {
        hasAttestation: !!attestation,
        hasUid: !!attestation?.uid,
        hasSchemaUid: !!attestation?.schemaUid,
      });
    }

    return res.status(200).json({ success: true, newXP });
  } catch (error: any) {
    log.error("checkin endpoint error", { error });
    return res.status(500).json({ error: "Internal server error" });
  }
}
