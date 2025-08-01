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

    // Use the original user_applications_view (simpler approach)
    let query = supabase
      .from('user_applications_view')
      .select(`
        id,
        user_profile_id,
        application_id,
        status,
        created_at,
        cohort_id,
        user_name,
        user_email,
        experience_level,
        payment_status,
        application_status
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

    console.log('Executing applications query...');
    const { data: applications, error } = await query;

    if (error) {
      console.error("Error fetching applications:", error);
      return res.status(500).json({
        error: "Failed to fetch applications",
        details: error.message
      });
    }

    console.log(`Fetched ${applications?.length || 0} applications`);
    console.log('First application:', applications?.[0]);

    // Fetch enrollment data and cohort names separately
    const userProfileIds = applications?.map(app => app.user_profile_id) || [];
    const cohortIds = applications?.map(app => app.cohort_id).filter(Boolean) || [];
    
    // Fetch cohort names
    let cohorts: any[] = [];
    if (cohortIds.length > 0) {
      const { data: cohortData } = await supabase
        .from('cohorts')
        .select('id, name, start_date, end_date')
        .in('id', cohortIds);
      
      cohorts = cohortData || [];
    }
    
    console.log('User profile IDs:', userProfileIds.length);
    console.log('Cohort IDs:', cohortIds.length);
    
    let enrollments: any[] = [];
    if (userProfileIds.length > 0 && cohortIds.length > 0) {
      console.log('Fetching enrollment data...');
      const { data: enrollmentData, error: enrollmentError } = await supabase
        .from('bootcamp_enrollments')
        .select('id, user_profile_id, cohort_id, enrollment_status, created_at')
        .in('user_profile_id', userProfileIds)
        .in('cohort_id', cohortIds);
      
      if (enrollmentError) {
        console.error('Error fetching enrollments:', enrollmentError);
        // Continue without enrollments rather than failing
      } else {
        console.log(`Fetched ${enrollmentData?.length || 0} enrollments`);
        enrollments = enrollmentData || [];
      }
    }

    // Combine applications with their enrollment data and cohort info
    const applicationsWithEnrollments = applications?.map(app => {
      const cohort = cohorts.find(c => c.id === app.cohort_id);
      return {
        ...app,
        cohort_name: cohort?.name || app.cohort_id,
        bootcamp_enrollments: enrollments.filter(enrollment => 
          enrollment.user_profile_id === app.user_profile_id && 
          enrollment.cohort_id === app.cohort_id
        )
      };
    }) || [];

    // Get total count for pagination
    let countQuery = supabase
      .from('user_applications_view')
      .select('id', { count: 'exact', head: true });

    if (status) countQuery = countQuery.eq('application_status', status);
    if (payment_status) countQuery = countQuery.eq('payment_status', payment_status);
    if (cohort_id) countQuery = countQuery.eq('cohort_id', cohort_id);

    const { count, error: countError } = await countQuery;

    if (countError) {
      console.error("Error getting applications count:", countError);
    }

    // Calculate stats from the combined data
    const stats = {
      total: count || 0,
      pending: applicationsWithEnrollments.filter(app => app.payment_status === 'pending').length || 0,
      completed: applicationsWithEnrollments.filter(app => app.payment_status === 'completed').length || 0,
      failed: applicationsWithEnrollments.filter(app => app.payment_status === 'failed').length || 0,
      inconsistent: applicationsWithEnrollments.filter(app => {
        const paymentStatus = app.payment_status;
        const status = app.status;
        return paymentStatus === 'completed' && (status === 'under_review' || status === 'pending');
      }).length || 0,
      missingEnrollments: applicationsWithEnrollments.filter(app => {
        const paymentStatus = app.payment_status;
        const status = app.status;
        const hasEnrollment = app.bootcamp_enrollments && app.bootcamp_enrollments.length > 0;
        return paymentStatus === 'completed' && status === 'approved' && !hasEnrollment;
      }).length || 0,
      missingPaymentRecords: 0 // We'll keep this for future use
    };

    res.status(200).json({
      success: true,
      applications: applicationsWithEnrollments,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: count || 0,
        totalPages: Math.ceil((count || 0) / Number(limit))
      },
      stats,
      inconsistentApplications: []
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