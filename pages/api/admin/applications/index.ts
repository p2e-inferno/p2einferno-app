import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { withAdminAuth } from "../../../../lib/auth/admin-auth";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:admin:applications:index");

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
      limit = 20,
    }: ApplicationsQuery = req.query;

    // Use the all_applications_view to catch orphaned applications
    let query = supabase.from("all_applications_view").select(`
        application_id,
        user_profile_id,
        user_application_status_id as id,
        user_application_status as status,
        application_created_at as created_at,
        cohort_id,
        cohort_name,
        user_name,
        user_email,
        experience_level,
        payment_status,
        application_status,
        missing_user_status,
        missing_profile_link,
        missing_enrollment,
        enrollment_id,
        enrollment_status
      `);

    // Apply filters
    if (status) {
      query = query.eq("application_status", status);
    }

    if (payment_status) {
      query = query.eq("payment_status", payment_status);
    }

    if (cohort_id) {
      query = query.eq("cohort_id", cohort_id);
    }

    // Apply pagination
    const offset = (Number(page) - 1) * Number(limit);
    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    const { data: applications, error } = await query;

    if (error) {
      log.error("Error fetching applications:", error);
      return res.status(500).json({
        error: "Failed to fetch applications",
        details: error.message,
      });
    }

    // Transform the data to match the expected format
    const applicationsWithEnrollments =
      applications?.map((app: any) => {
        // Build bootcamp_enrollments array from the view data
        const bootcamp_enrollments = app.enrollment_id
          ? [
              {
                id: app.enrollment_id,
                enrollment_status: app.enrollment_status,
                created_at: app.enrollment_created_at,
              },
            ]
          : [];

        return {
          ...app,
          // Map fields to expected names
          id: app.id || app.application_id, // Use app ID if status ID is missing
          bootcamp_enrollments,
          // Add data quality indicators
          data_issues: {
            missing_user_status: app.missing_user_status,
            missing_profile_link: app.missing_profile_link,
            missing_enrollment: app.missing_enrollment,
          },
        };
      }) || [];

    // Get total count for pagination
    let countQuery = supabase
      .from("all_applications_view")
      .select("application_id", { count: "exact", head: true });

    if (status) countQuery = countQuery.eq("application_status", status);
    if (payment_status)
      countQuery = countQuery.eq("payment_status", payment_status);
    if (cohort_id) countQuery = countQuery.eq("cohort_id", cohort_id);

    const { count, error: countError } = await countQuery;

    if (countError) {
      log.error("Error getting applications count:", countError);
    }

    // Calculate stats from the combined data including data quality issues
    const stats = {
      total: count || 0,
      pending:
        applicationsWithEnrollments.filter(
          (app: any) => app.payment_status === "pending",
        ).length || 0,
      completed:
        applicationsWithEnrollments.filter(
          (app: any) => app.payment_status === "completed",
        ).length || 0,
      failed:
        applicationsWithEnrollments.filter(
          (app: any) => app.payment_status === "failed",
        ).length || 0,
      inconsistent:
        applicationsWithEnrollments.filter((app: any) => {
          // Check for any data quality issues
          return (
            app.data_issues?.missing_user_status ||
            app.data_issues?.missing_profile_link ||
            app.data_issues?.missing_enrollment ||
            (app.payment_status === "completed" && app.status === "pending")
          );
        }).length || 0,
      missingEnrollments:
        applicationsWithEnrollments.filter((app: any) => {
          return app.data_issues?.missing_enrollment === true;
        }).length || 0,
      missingPaymentRecords:
        applicationsWithEnrollments.filter((app: any) => {
          return app.data_issues?.missing_user_status === true;
        }).length || 0,
    };

    res.status(200).json({
      success: true,
      applications: applicationsWithEnrollments,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: count || 0,
        totalPages: Math.ceil((count || 0) / Number(limit)),
      },
      stats,
      inconsistentApplications: [],
    });
  } catch (error) {
    log.error("Admin applications API error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export default withAdminAuth(handler);
