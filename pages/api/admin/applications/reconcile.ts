import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "../../../../lib/supabase/server";
import { withAdminAuth } from "../../../../lib/auth/admin-auth";
import { enrollmentService } from "../../../../lib/services/enrollment-service";

interface ReconcileRequest {
  applicationId: string;
  actions: ('sync_status' | 'create_payment_record' | 'create_enrollment')[];
}

interface ReconcileResult {
  action: string;
  success: boolean;
  message?: string;
  error?: string;
  data?: any;
}

/**
 * Reconcile application data inconsistencies
 * POST /api/admin/applications/reconcile
 * 
 * Body:
 * {
 *   applicationId: string,
 *   actions: ['sync_status', 'create_payment_record', 'create_enrollment']
 * }
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createAdminClient();
    const { applicationId, actions }: ReconcileRequest = req.body;

    if (!applicationId) {
      return res.status(400).json({ error: "Missing applicationId" });
    }

    if (!actions || !Array.isArray(actions) || actions.length === 0) {
      return res.status(400).json({ error: "Missing or invalid actions array" });
    }

    console.log(`Admin reconciling application ${applicationId} with actions:`, actions);

    // Get application details first
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`
        id,
        user_email,
        cohort_id,
        payment_status,
        application_status,
        created_at,
        user_profiles!applications_user_email_fkey (
          id, privy_user_id
        ),
        user_application_status!user_application_status_application_id_fkey (
          id, status
        ),
        payment_transactions (
          id, status, payment_reference
        ),
        enrollments!enrollments_cohort_id_fkey (
          id, enrollment_status
        )
      `)
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return res.status(404).json({
        error: "Application not found",
        details: appError?.message
      });
    }

    const results: ReconcileResult[] = [];

    // Execute each requested action
    for (const action of actions) {
      try {
        switch (action) {
          case 'sync_status':
            const syncResult = await syncApplicationStatus(supabase, application);
            results.push(syncResult);
            break;

          case 'create_payment_record':
            const paymentResult = await createMissingPaymentRecord(supabase, application);
            results.push(paymentResult);
            break;

          case 'create_enrollment':
            const enrollmentResult = await createMissingEnrollment(applicationId);
            results.push(enrollmentResult);
            break;

          default:
            results.push({
              action,
              success: false,
              error: `Unknown action: ${action}`
            });
        }
      } catch (error) {
        results.push({
          action,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const successfulActions = results.filter(r => r.success).length;
    const failedActions = results.filter(r => !r.success).length;

    res.status(200).json({
      success: failedActions === 0,
      message: `Reconciliation completed: ${successfulActions} successful, ${failedActions} failed`,
      results,
      summary: {
        total: results.length,
        successful: successfulActions,
        failed: failedActions
      }
    });

  } catch (error) {
    console.error("Admin reconciliation error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

/**
 * Sync user_application_status with applications table
 */
async function syncApplicationStatus(supabase: any, application: any): Promise<ReconcileResult> {
  try {
    const userAppStatus = application.user_application_status?.[0];
    
    if (!userAppStatus) {
      // Create missing user_application_status record
      const { data, error } = await supabase
        .from('user_application_status')
        .insert({
          application_id: application.id,
          user_profile_id: application.user_profiles?.id,
          status: application.payment_status,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        return {
          action: 'sync_status',
          success: false,
          error: `Failed to create user application status: ${error.message}`
        };
      }

      return {
        action: 'sync_status',
        success: true,
        message: 'Created missing user application status record',
        data
      };
    }

    if (userAppStatus.status !== application.payment_status) {
      // Update existing record
      const { data, error } = await supabase
        .from('user_application_status')
        .update({
          status: application.payment_status,
          updated_at: new Date().toISOString()
        })
        .eq('id', userAppStatus.id)
        .select()
        .single();

      if (error) {
        return {
          action: 'sync_status',
          success: false,
          error: `Failed to update user application status: ${error.message}`
        };
      }

      return {
        action: 'sync_status',
        success: true,
        message: `Updated status from '${userAppStatus.status}' to '${application.payment_status}'`,
        data
      };
    }

    return {
      action: 'sync_status',
      success: true,
      message: 'Status already synchronized'
    };

  } catch (error) {
    return {
      action: 'sync_status',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Create missing payment_transactions record
 */
async function createMissingPaymentRecord(supabase: any, application: any): Promise<ReconcileResult> {
  try {
    const existingPayment = application.payment_transactions?.[0];
    
    if (existingPayment) {
      return {
        action: 'create_payment_record',
        success: true,
        message: 'Payment record already exists'
      };
    }

    if (application.payment_status !== 'completed') {
      return {
        action: 'create_payment_record',
        success: false,
        error: 'Cannot create payment record for non-completed application'
      };
    }

    const { data, error } = await supabase
      .from('payment_transactions')
      .insert({
        application_id: application.id,
        payment_reference: `admin-reconcile-${application.id}-${Date.now()}`,
        status: 'success',
        payment_method: 'unknown',
        metadata: {
          reconciledBy: 'admin',
          reconciledAt: new Date().toISOString(),
          reason: 'Missing payment record for completed application',
          originalApplicationStatus: application.application_status,
          originalPaymentStatus: application.payment_status
        },
        created_at: application.created_at,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      return {
        action: 'create_payment_record',
        success: false,
        error: `Failed to create payment record: ${error.message}`
      };
    }

    return {
      action: 'create_payment_record',
      success: true,
      message: 'Created missing payment record',
      data
    };

  } catch (error) {
    return {
      action: 'create_payment_record',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Create missing enrollment using enrollment service
 */
async function createMissingEnrollment(applicationId: string): Promise<ReconcileResult> {
  try {
    const result = await enrollmentService.createEnrollmentForCompletedApplication(applicationId);
    
    return {
      action: 'create_enrollment',
      success: result.success,
      message: result.message,
      error: result.error,
      data: result.data
    };

  } catch (error) {
    return {
      action: 'create_enrollment',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export default withAdminAuth(handler);