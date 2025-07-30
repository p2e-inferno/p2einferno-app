import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "../../../../lib/supabase/server";
import { withAdminAuth } from "../../../../lib/auth/admin-auth";

interface ApplicationsQuery {
  status?: string;
  payment_status?: string;
  cohort_id?: string;
  page?: number;
  limit?: number;
}

/**
 * Fetch applications for admin management
 * GET /api/admin/applications
 * 
 * Query parameters:
 * - status: Filter by application_status
 * - payment_status: Filter by payment_status  
 * - cohort_id: Filter by cohort
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createAdminClient();
    
    const {
      status,
      payment_status,
      cohort_id,
      page = 1,
      limit = 20
    }: ApplicationsQuery = req.query;

    // Build the query
    let query = supabase
      .from('applications')
      .select(`
        id,
        user_email,
        user_name,
        phone_number,
        payment_status,
        application_status,
        created_at,
        updated_at,
        cohort_id,
        cohorts (
          id,
          name,
          start_date,
          end_date,
          lock_address
        ),
        payment_transactions (
          id,
          status,
          payment_reference,
          transaction_hash,
          payment_method,
          created_at,
          updated_at,
          metadata
        ),
        user_profiles!applications_user_email_fkey (
          id,
          username,
          wallet_address,
          display_name,
          privy_user_id
        ),
        user_application_status!user_application_status_application_id_fkey (
          id,
          status,
          created_at,
          updated_at
        ),
        enrollments!enrollments_cohort_id_fkey (
          id,
          enrollment_status,
          enrolled_at,
          completed_at
        )
      `);

    // Apply filters
    if (status) {
      query = query.eq('application_status', status);
    }
    
    if (payment_status) {
      query = query.eq('payment_status', payment_status);
    }
    
    if (cohort_id) {
      query = query.eq('cohort_id', cohort_id);
    }

    // Apply pagination
    const offset = (Number(page) - 1) * Number(limit);
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    const { data: applications, error } = await query;

    if (error) {
      console.error("Error fetching applications:", error);
      return res.status(500).json({
        error: "Failed to fetch applications",
        details: error.message
      });
    }

    // Get total count for pagination
    let countQuery = supabase
      .from('applications')
      .select('id', { count: 'exact', head: true });

    if (status) countQuery = countQuery.eq('application_status', status);
    if (payment_status) countQuery = countQuery.eq('payment_status', payment_status);
    if (cohort_id) countQuery = countQuery.eq('cohort_id', cohort_id);

    const { count, error: countError } = await countQuery;

    if (countError) {
      console.error("Error getting applications count:", countError);
    }

    // Analyze data inconsistencies
    const inconsistentApplications = applications?.filter(app => {
      const paymentStatus = app.payment_status;
      const userAppStatus = app.user_application_status?.[0]?.status;
      const hasEnrollment = app.enrollments && app.enrollments.length > 0;
      const hasPaymentRecord = app.payment_transactions && app.payment_transactions.length > 0;

      return (
        // Status mismatch
        (paymentStatus !== userAppStatus) ||
        // Completed payment but no enrollment
        (paymentStatus === 'completed' && !hasEnrollment) ||
        // Completed payment but no payment record
        (paymentStatus === 'completed' && !hasPaymentRecord)
      );
    }) || [];

    const stats = {
      total: count || 0,
      pending: applications?.filter(app => app.payment_status === 'pending').length || 0,
      completed: applications?.filter(app => app.payment_status === 'completed').length || 0,
      failed: applications?.filter(app => app.payment_status === 'failed').length || 0,
      inconsistent: inconsistentApplications.length,
      missingEnrollments: applications?.filter(app => 
        app.payment_status === 'completed' && 
        (!app.enrollments || app.enrollments.length === 0)
      ).length || 0,
      missingPaymentRecords: applications?.filter(app => 
        app.payment_status === 'completed' && 
        (!app.payment_transactions || app.payment_transactions.length === 0)
      ).length || 0
    };

    res.status(200).json({
      success: true,
      applications: applications || [],
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: count || 0,
        totalPages: Math.ceil((count || 0) / Number(limit))
      },
      stats,
      inconsistentApplications: inconsistentApplications.map(app => ({
        id: app.id,
        user_email: app.user_email,
        issues: []
      }))
    });

  } catch (error) {
    console.error("Admin applications API error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

export default withAdminAuth(handler);