import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "../../../../lib/supabase/server";
import { withAdminAuth } from "../../../../lib/auth/admin-auth";

import { StatusSyncService } from "../../../../lib/services/status-sync-service";

interface ReconcileRequest {
  applicationId: string;
  actions?: ('sync_status' | 'create_payment_record' | 'create_enrollment' | 'approve_application')[];
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

    console.log(`Admin reconciling application ${applicationId}`);
    console.log('Request body:', { applicationId, actions });
    
    // First verify the application exists
    const { data: appCheck, error: appCheckError } = await supabase
      .from("applications")
      .select("id, user_email")
      .eq("id", applicationId)
      .single();
      
    console.log('Application lookup result:', { appCheck, appCheckError });

    // If no specific actions provided, use the new comprehensive reconcile service
    if (!actions || actions.length === 0) {
      // Get user profile ID directly from application (much simpler now!)
      const { data: application, error: appError } = await supabase
        .from("applications")
        .select("id, user_profile_id, user_email")
        .eq("id", applicationId)
        .single();

      if (appError || !application) {
        return res.status(404).json({ error: "Application not found" });
      }

      let userProfileId = application.user_profile_id;

      // Fallback for old applications that don't have user_profile_id set
      if (!userProfileId) {
        console.log(`Application ${applicationId} missing user_profile_id, trying email lookup as fallback`);
        const { data: userProfile, error: profileError } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("email", application.user_email)
          .single();

        if (profileError || !userProfile) {
          console.error(`User profile not found for email: ${application.user_email}`, profileError);
          return res.status(404).json({ 
            error: "User profile not found for application. User may need to create a profile first." 
          });
        }
        
        userProfileId = userProfile.id;
        
        // Update the application with the found user_profile_id for future use
        await supabase
          .from("applications")
          .update({ user_profile_id: userProfileId })
          .eq("id", applicationId);
          
        console.log(`Updated application ${applicationId} with user_profile_id ${userProfileId}`);
      }

      if (!userProfileId) {
        return res.status(404).json({ 
          error: "User profile not found for application. User may need to create a profile first." 
        });
      }

      // Create user_application_status record if it doesn't exist (this is the main issue)
      const { data: existingStatus } = await supabase
        .from("user_application_status")
        .select("id")
        .eq("application_id", applicationId)
        .eq("user_profile_id", userProfileId);

      if (!existingStatus || existingStatus.length === 0) {
        console.log(`Creating missing user_application_status record for application ${applicationId}`);
        await supabase
          .from("user_application_status")
          .insert({
            user_profile_id: userProfileId,
            application_id: applicationId,
            status: 'pending'
          });
      }

      // Update payment transaction to success (to remove from admin payments list)
      await supabase
        .from("payment_transactions")
        .update({
          status: 'success',
          metadata: {
            reconciledAt: new Date().toISOString(),
            reconciledBy: 'admin',
            originalStatus: 'processing'
          }
        })
        .eq("application_id", applicationId);

      // Update application status to completed/approved
      await supabase
        .from("applications")
        .update({
          payment_status: 'completed',
          application_status: 'approved'
        })
        .eq("id", applicationId);

      // Use the comprehensive status sync service
      const reconcileResult = await StatusSyncService.reconcileApplicationStatus(
        applicationId, 
        userProfileId
      );

      if (!reconcileResult.success) {
        return res.status(500).json({
          success: false,
          error: reconcileResult.error,
          message: "Failed to reconcile application status"
        });
      }

      console.log(`Successfully reconciled application ${applicationId} - should now be filtered out of payments list`);

      return res.status(200).json({
        success: true,
        message: "Payment reconciled successfully! Transaction has been marked as completed.",
        data: reconcileResult.data
      });
    }

    // Legacy mode: execute specific actions
    console.log(`Admin reconciling application ${applicationId} with specific actions:`, actions);

    // Get application details directly from tables to avoid view caching issues
    // First get the user_application_status record
    const { data: userAppStatus, error: statusError } = await supabase
      .from('user_application_status')
      .select('*')
      .eq('application_id', applicationId)
      .single();

    if (statusError || !userAppStatus) {
      console.error('User application status not found:', statusError);
      return res.status(404).json({
        error: "Application status not found",
        details: statusError?.message,
        applicationId
      });
    }

    // Then get the application details
    const { data: appDetails, error: appDetailsError } = await supabase
      .from('applications')
      .select('*')
      .eq('id', applicationId)
      .single();

    if (appDetailsError || !appDetails) {
      console.error('Application details not found:', appDetailsError);
      return res.status(404).json({
        error: "Application details not found",
        details: appDetailsError?.message,
        applicationId
      });
    }

    // Combine the data in the expected format
    const application = {
      id: userAppStatus.id,
      application_id: userAppStatus.application_id,
      user_profile_id: userAppStatus.user_profile_id,
      status: userAppStatus.status,
      created_at: userAppStatus.created_at,
      cohort_id: appDetails.cohort_id,
      user_name: appDetails.user_name,
      user_email: appDetails.user_email,
      experience_level: appDetails.experience_level,
      payment_status: appDetails.payment_status,
      application_status: appDetails.application_status
    };


    const results: ReconcileResult[] = [];

    // Execute each requested action
    for (const action of actions) {
      try {
        switch (action) {
          case 'approve_application':
            const approveResult = await approveApplication(supabase, application);
            results.push(approveResult);
            break;

          case 'sync_status':
            const syncResult = await syncApplicationStatus(supabase, application);
            results.push(syncResult);
            break;

          case 'create_payment_record':
            const paymentResult = await createMissingPaymentRecord(supabase, application);
            results.push(paymentResult);
            break;

          case 'create_enrollment':
            const enrollmentResult = await createMissingEnrollment(supabase, application);
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
 * Create missing enrollment directly in bootcamp_enrollments table
 */
async function createMissingEnrollment(supabase: any, application: any): Promise<ReconcileResult> {
  try {
    // Create enrollment in bootcamp_enrollments table
    const { data, error: enrollError } = await supabase
      .from('bootcamp_enrollments')
      .insert({
        user_profile_id: application.user_profile_id,
        cohort_id: application.cohort_id,
        enrollment_status: 'enrolled',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (enrollError) {
      // If enrollment already exists, that's okay
      if (enrollError.code === '23505') { // unique constraint violation
        return {
          action: 'create_enrollment',
          success: true,
          message: 'Enrollment already exists',
        };
      } else {
        throw new Error(`Failed to create enrollment: ${enrollError.message}`);
      }
    }

    return {
      action: 'create_enrollment',
      success: true,
      message: 'Enrollment created successfully',
      data
    };

  } catch (error) {
    return {
      action: 'create_enrollment',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Approve application - Update user_application_status from pending_review to approved
 * and create enrollment in bootcamp_enrollments table
 */
async function approveApplication(supabase: any, application: any): Promise<ReconcileResult> {
  try {
    console.log('Approving application:', application.application_id);

    // 1. Update user_application_status to 'approved'
    const { error: statusError } = await supabase
      .from('user_application_status')
      .update({ 
        status: 'approved',
        updated_at: new Date().toISOString()
      })
      .eq('application_id', application.application_id);

    if (statusError) {
      throw new Error(`Failed to update application status: ${statusError.message}`);
    }

    // 2. Create enrollment in bootcamp_enrollments table (only if it doesn't exist)
    // First check if enrollment already exists
    const { data: existingEnrollment, error: checkError } = await supabase
      .from('bootcamp_enrollments')
      .select('id')
      .eq('user_profile_id', application.user_profile_id)
      .eq('cohort_id', application.cohort_id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows found
      throw new Error(`Failed to check existing enrollment: ${checkError.message}`);
    }

    if (!existingEnrollment) {
      const { error: enrollError } = await supabase
        .from('bootcamp_enrollments')
        .insert({
          user_profile_id: application.user_profile_id,
          cohort_id: application.cohort_id,
          enrollment_status: 'enrolled',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (enrollError) {
        // If enrollment already exists, that's okay (race condition)
        if (enrollError.code !== '23505') { // unique constraint violation
          throw new Error(`Failed to create enrollment: ${enrollError.message}`);
        }
      }
    }

    return {
      action: 'approve_application',
      success: true,
      message: 'Application approved and enrollment created successfully'
    };

  } catch (error) {
    return {
      action: 'approve_application', 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export default withAdminAuth(handler);