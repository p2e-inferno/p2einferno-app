import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "../../../../lib/supabase/server";
import { createPrivyClient } from "../../../../lib/privyUtils";

import { StatusSyncService } from "../../../../lib/services/status-sync-service";

interface UserReconcileRequest {
  applicationId: string;
  privyUserId?: string;
}

// Initialize Privy client with error handling
let client: any = null;
try {
  client = createPrivyClient();
} catch (error) {
  console.error("Failed to initialize Privy client:", error);
}

/**
 * User endpoint to reconcile their own application status
 * POST /api/user/applications/reconcile
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get authorization token from request
    const authToken = req.headers.authorization?.replace("Bearer ", "");
    if (!authToken) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    // Use the same authentication pattern as profile API
    let verifiedClaims: any;
    let privyUserId: string | null = null;

    // Get privyUserId from request body first (same as profile API)
    privyUserId = req.body?.privyUserId;
    
    // Fallback to token verification if no body data
    if (!privyUserId && client) {
      try {
        verifiedClaims = await client.verifyAuthToken(authToken);
        privyUserId = verifiedClaims?.userId;
      } catch (verifyErr) {
        console.error(
          "Privy token verification failed – using body data",
          verifyErr
        );
      }
    }

    if (!privyUserId) {
      return res.status(401).json({ error: "Invalid user token and no privyUserId provided" });
    }

    const { applicationId }: UserReconcileRequest = req.body;

    if (!applicationId) {
      return res.status(400).json({ error: "Missing applicationId" });
    }

    console.log(`User ${privyUserId} reconciling application ${applicationId}`);

    const supabase = createAdminClient();

    // 1. Get user profile
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('privy_user_id', privyUserId)
      .single();

    if (profileError || !userProfile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    // 2. Verify user owns this application
    const { data: userAppStatus, error: userAppError } = await supabase
      .from('user_application_status')
      .select('application_id')
      .eq('application_id', applicationId)
      .eq('user_profile_id', userProfile.id)
      .single();

    if (userAppError || !userAppStatus) {
      return res.status(403).json({ 
        error: "You don't have permission to access this application" 
      });
    }

    // 3. Use the new status sync service for comprehensive reconciliation
    const reconcileResult = await StatusSyncService.reconcileApplicationStatus(
      applicationId, 
      userProfile.id
    );

    if (!reconcileResult.success) {
      return res.status(500).json({
        success: false,
        error: reconcileResult.error,
        message: "Failed to reconcile application status"
      });
    }

    res.status(200).json({
      success: true,
      message: "Application status reconciled successfully",
      data: reconcileResult.data
    });

  } catch (error) {
    console.error("User reconciliation error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}