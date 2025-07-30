/**
 * Enrollment Service
 * Handles creation and management of user enrollments for completed applications
 */

import { createAdminClient } from '../supabase/server';

interface EnrollmentResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}

interface Application {
  id: string;
  user_email: string;
  cohort_id: string;
  payment_status: string;
  application_status: string;
  cohorts: {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
  };
  user_profiles: {
    id: string;
    email?: string;
    privy_user_id: string;
  };
}

export const enrollmentService = {
  /**
   * Create enrollment for a completed application
   */
  async createEnrollmentForCompletedApplication(applicationId: string): Promise<EnrollmentResult> {
    try {
      const supabase = createAdminClient();
      
      // Get application details with related data
      const { data: app, error: appError } = await supabase
        .from('applications')
        .select(`
          id, user_email, cohort_id, payment_status, application_status,
          cohorts (
            id, name, start_date, end_date
          ),
          user_profiles!applications_user_email_fkey (
            id, email, privy_user_id
          )
        `)
        .eq('id', applicationId)
        .single();

      if (appError || !app) {
        return { 
          success: false, 
          error: `Application not found: ${appError?.message || 'Unknown error'}` 
        };
      }

      // Validate application is eligible for enrollment
      if (app.payment_status !== 'completed') {
        return { 
          success: false, 
          error: `Application payment not completed. Current status: ${app.payment_status}` 
        };
      }

      if (!app.user_profiles) {
        return { 
          success: false, 
          error: 'User profile not found for application' 
        };
      }

      // Check if enrollment already exists
      const { data: existingEnrollment, error: enrollmentCheckError } = await supabase
        .from('enrollments')
        .select('id, enrollment_status')
        .eq('user_profile_id', app.user_profiles.id)
        .eq('cohort_id', app.cohort_id)
        .single();

      if (enrollmentCheckError && enrollmentCheckError.code !== 'PGRST116') {
        // PGRST116 is "not found", which is expected
        return { 
          success: false, 
          error: `Error checking existing enrollment: ${enrollmentCheckError.message}` 
        };
      }

      if (existingEnrollment) {
        return { 
          success: true, 
          message: `Enrollment already exists with status: ${existingEnrollment.enrollment_status}`,
          data: existingEnrollment
        };
      }

      // Create new enrollment
      const { data: newEnrollment, error: createError } = await supabase
        .from('enrollments')
        .insert({
          user_profile_id: app.user_profiles.id,
          cohort_id: app.cohort_id,
          enrollment_status: 'active',
          enrolled_at: new Date().toISOString(),
          metadata: {
            createdBy: 'enrollment-service',
            applicationId: applicationId,
            cohortName: app.cohorts?.name
          }
        })
        .select()
        .single();

      if (createError) {
        return { 
          success: false, 
          error: `Failed to create enrollment: ${createError.message}` 
        };
      }

      return { 
        success: true, 
        data: newEnrollment,
        message: 'Enrollment created successfully'
      };

    } catch (error) {
      console.error('Enrollment service error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  },

  /**
   * Bulk create enrollments for multiple applications
   */
  async bulkCreateEnrollments(applicationIds: string[]): Promise<{
    successful: EnrollmentResult[];
    failed: EnrollmentResult[];
    total: number;
  }> {
    const results = await Promise.allSettled(
      applicationIds.map(id => this.createEnrollmentForCompletedApplication(id))
    );

    const successful: EnrollmentResult[] = [];
    const failed: EnrollmentResult[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          successful.push(result.value);
        } else {
          failed.push({
            ...result.value,
            error: `Application ${applicationIds[index]}: ${result.value.error}`
          });
        }
      } else {
        failed.push({
          success: false,
          error: `Application ${applicationIds[index]}: ${result.reason}`
        });
      }
    });

    return {
      successful,
      failed,
      total: applicationIds.length
    };
  },

  /**
   * Find applications that need enrollment creation
   */
  async findApplicationsNeedingEnrollments(): Promise<{
    success: boolean;
    applications?: any[];
    error?: string;
  }> {
    try {
      const supabase = createAdminClient();

      const { data: applications, error } = await supabase
        .from('applications')
        .select(`
          id, user_email, cohort_id, payment_status, application_status,
          cohorts (name),
          user_profiles!applications_user_email_fkey (id)
        `)
        .eq('payment_status', 'completed')
        .eq('application_status', 'submitted')
        .is('enrollments.id', null); // Left join with enrollments would be done in a more complex query

      if (error) {
        return { success: false, error: error.message };
      }

      // Filter out applications that already have enrollments
      // This is a simpler approach since Supabase doesn't easily support complex LEFT JOINs with IS NULL
      const appsNeedingEnrollments = [];
      
      for (const app of applications || []) {
        if (!app.user_profiles?.id) continue;

        const { data: enrollment } = await supabase
          .from('enrollments')
          .select('id')
          .eq('user_profile_id', app.user_profiles.id)
          .eq('cohort_id', app.cohort_id)
          .single();

        if (!enrollment) {
          appsNeedingEnrollments.push(app);
        }
      }

      return { 
        success: true, 
        applications: appsNeedingEnrollments 
      };

    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
};