import { NextApiRequest, NextApiResponse } from "next";
import { createServerClient } from "../../../../lib/supabase/server";
import { verifyPrivyToken } from "../../../../lib/auth/privy-server";
import { enrollmentService } from "../../../../lib/services/enrollment-service";

interface UserReconcileRequest {
  applicationId: string;
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
    // Verify user authentication
    const user = await verifyPrivyToken(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { applicationId }: UserReconcileRequest = req.body;

    if (!applicationId) {
      return res.status(400).json({ error: "Missing applicationId" });
    }

    console.log(`User ${user.id} reconciling application ${applicationId}`);

    const supabase = createServerClient(req, res);

    // 1. Verify user owns this application
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`
        id,
        user_email,
        payment_status,
        application_status,
        cohort_id,
        created_at,
        user_profiles!applications_user_email_fkey (
          id, privy_user_id
        ),
        user_application_status!user_application_status_application_id_fkey (
          id, status
        )
      `)
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return res.status(404).json({ 
        error: "Application not found or you don't have access to it" 
      });
    }

    // Verify ownership - check if the application belongs to this user
    const userProfile = application.user_profiles;
    if (!userProfile || userProfile.privy_user_id !== user.id) {
      // Also check by email as fallback
      if (application.user_email !== user.email) {
        return res.status(403).json({ 
          error: "You don't have permission to access this application" 
        });
      }
    }

    const userAppStatus = application.user_application_status?.[0];
    let reconciliationActions = [];

    // 2. Check what needs to be reconciled
    const needsStatusSync = application.payment_status !== userAppStatus?.status;
    const needsEnrollment = application.payment_status === 'completed' && 
                           application.application_status === 'submitted';

    // 3. Perform reconciliation actions
    if (needsStatusSync && userAppStatus) {
      // Sync user_application_status with applications table
      const { error: updateError } = await supabase
        .from('user_application_status')
        .update({
          status: application.payment_status,
          updated_at: new Date().toISOString()
        })
        .eq('id', userAppStatus.id);

      if (updateError) {
        console.error('Failed to sync application status:', updateError);
        reconciliationActions.push({
          action: 'sync_status',
          success: false,
          error: updateError.message
        });
      } else {
        reconciliationActions.push({
          action: 'sync_status',
          success: true,
          message: `Updated status from '${userAppStatus.status}' to '${application.payment_status}'`
        });
      }
    }

    // 4. Create enrollment if needed
    if (needsEnrollment) {
      const enrollmentResult = await enrollmentService.createEnrollmentForCompletedApplication(applicationId);
      reconciliationActions.push({
        action: 'create_enrollment',
        success: enrollmentResult.success,
        message: enrollmentResult.message,
        error: enrollmentResult.error
      });
    }

    // 5. If no actions were needed, check if everything is consistent
    if (reconciliationActions.length === 0) {
      // Check if there are any other issues
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('id')
        .eq('user_profile_id', userProfile?.id)
        .eq('cohort_id', application.cohort_id);

      if (application.payment_status === 'completed' && (!enrollments || enrollments.length === 0)) {
        // Try to create missing enrollment
        const enrollmentResult = await enrollmentService.createEnrollmentForCompletedApplication(applicationId);
        reconciliationActions.push({
          action: 'create_enrollment',
          success: enrollmentResult.success,
          message: enrollmentResult.message,
          error: enrollmentResult.error
        });
      } else {
        reconciliationActions.push({
          action: 'check_consistency',
          success: true,
          message: 'Application data is already consistent'
        });
      }
    }

    const successful = reconciliationActions.filter(a => a.success).length;
    const failed = reconciliationActions.filter(a => !a.success).length;

    res.status(200).json({
      success: failed === 0,
      message: `Reconciliation completed: ${successful} successful, ${failed} failed`,
      actions: reconciliationActions,
      summary: {
        total: reconciliationActions.length,
        successful,
        failed
      }
    });

  } catch (error) {
    console.error("User reconciliation error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}