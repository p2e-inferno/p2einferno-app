import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "../../../../lib/auth/privy";
import { StatusSyncService } from "../../../../lib/services/status-sync-service";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:user:applications:reconcile");

interface UserReconcileRequest {
  applicationId: string;
  privyUserId?: string;
}

/**
 * User endpoint to reconcile their own application status
 * POST /api/user/applications/reconcile
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get authorization token from request
    const privyUser = await getPrivyUser(req);
    const privyUserId = privyUser?.id;

    if (!privyUserId) {
      return res
        .status(401)
        .json({ error: "Invalid user token and no privyUserId provided" });
    }

    const { applicationId }: UserReconcileRequest = req.body;

    if (!applicationId) {
      return res.status(400).json({ error: "Missing applicationId" });
    }

    log.info(`User ${privyUserId} reconciling application ${applicationId}`);

    const supabase = createAdminClient();

    // 1. Get user profile
    const { data: userProfile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("privy_user_id", privyUserId)
      .single();

    if (profileError || !userProfile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    // 2. Verify user owns this application
    const { data: userAppStatus, error: userAppError } = await supabase
      .from("user_application_status")
      .select("application_id")
      .eq("application_id", applicationId)
      .eq("user_profile_id", userProfile.id)
      .single();

    if (userAppError || !userAppStatus) {
      return res.status(403).json({
        error: "You don't have permission to access this application",
      });
    }

    // 3. Use the new status sync service for comprehensive reconciliation
    const reconcileResult = await StatusSyncService.reconcileApplicationStatus(
      applicationId,
      userProfile.id,
    );

    if (!reconcileResult.success) {
      return res.status(500).json({
        success: false,
        error: reconcileResult.error,
        message: "Failed to reconcile application status",
      });
    }

    res.status(200).json({
      success: true,
      message: "Application status reconciled successfully",
      data: reconcileResult.data,
    });
  } catch (error) {
    log.error("User reconciliation error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
