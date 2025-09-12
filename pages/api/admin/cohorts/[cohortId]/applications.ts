import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { withAdminAuth } from "@/lib/auth/admin-auth";
import { computeUserApplicationStatus } from "../../../../../lib/types/application-status";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:admin:cohorts:[cohortId]:applications");

interface CohortApplication {
  id: string;
  user_name: string;
  user_email: string;
  experience_level: string;
  motivation: string;
  payment_status: string;
  application_status: string;
  user_application_status: string;
  enrollment_status?: string;
  created_at: string;
  updated_at: string;
  amount_paid?: number;
  currency?: string;
  needs_reconciliation: boolean;
}

/**
 * Get cohort applications with stats
 * GET /api/admin/cohorts/[cohortId]/applications
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createAdminClient();

    const { cohortId } = req.query;

    if (!cohortId || typeof cohortId !== "string") {
      return res.status(400).json({ error: "Invalid cohort ID" });
    }

    // Get all applications for this cohort with related data
    const { data: rawApplications, error: applicationsError } = await supabase
      .from("applications")
      .select(
        `
        id,
        user_name,
        user_email,
        experience_level,
        motivation,
        payment_status,
        application_status,
        total_amount,
        currency,
        created_at,
        updated_at,
        user_profiles (
          id,
          privy_user_id
        ),
        user_application_status!user_application_status_application_id_fkey (
          status,
          amount_paid,
          currency
        ),
        payment_transactions!payment_transactions_application_id_fkey (
          amount,
          currency,
          status
        )
      `,
      )
      .eq("cohort_id", cohortId)
      .order("created_at", { ascending: false });

    if (applicationsError) {
      log.error("Error fetching applications:", applicationsError);
      return res.status(500).json({ error: "Failed to fetch applications" });
    }

    // Get enrollment data for users in this cohort
    const userProfileIds =
      rawApplications
        ?.map((app: any) => {
          const userProfile = Array.isArray(app.user_profiles)
            ? app.user_profiles[0]
            : app.user_profiles;
          return userProfile?.id;
        })
        .filter(Boolean) || [];

    const { data: enrollments } = await supabase
      .from("bootcamp_enrollments")
      .select("user_profile_id, enrollment_status")
      .eq("cohort_id", cohortId)
      .in("user_profile_id", userProfileIds);

    // Process applications and detect inconsistencies
    const applications: CohortApplication[] = (rawApplications || []).map(
      (app: any) => {
        const userStatus = Array.isArray(app.user_application_status)
          ? app.user_application_status[0]
          : app.user_application_status;

        const userProfile = Array.isArray(app.user_profiles)
          ? app.user_profiles[0]
          : app.user_profiles;
        const enrollment = enrollments?.find(
          (e: any) => e.user_profile_id === userProfile?.id,
        );
        const enrollmentStatus = enrollment?.enrollment_status;

        // Compute what the status should be
        const expectedStatus = computeUserApplicationStatus(
          app.payment_status as any,
          app.application_status as any,
          enrollmentStatus as any,
        );

        // Check if there's a mismatch (needs reconciliation)
        const currentUserStatus = userStatus?.status || "payment_pending";
        const needsReconciliation = currentUserStatus !== expectedStatus;

        // Get payment amount from multiple sources
        let amountPaid = userStatus?.amount_paid;
        let currency = userStatus?.currency || app.currency;

        if (!amountPaid && app.payment_transactions?.length > 0) {
          const successfulPayment = app.payment_transactions.find(
            (pt: any) => pt.status === "success",
          );
          if (successfulPayment) {
            amountPaid = successfulPayment.amount;
            currency = successfulPayment.currency;
          }
        }

        if (!amountPaid) {
          amountPaid = app.total_amount;
        }

        return {
          id: app.id,
          user_name: app.user_name,
          user_email: app.user_email,
          experience_level: app.experience_level,
          motivation: app.motivation,
          payment_status: app.payment_status,
          application_status: app.application_status,
          user_application_status: currentUserStatus,
          enrollment_status: enrollmentStatus,
          created_at: app.created_at,
          updated_at: app.updated_at,
          amount_paid: amountPaid,
          currency,
          needs_reconciliation: needsReconciliation,
        };
      },
    );

    // Calculate stats
    const stats = {
      total_applications: applications.length,
      pending_payment: applications.filter(
        (app) =>
          app.user_application_status === "payment_pending" ||
          app.user_application_status === "draft",
      ).length,
      payment_completed: applications.filter(
        (app) => app.payment_status === "completed",
      ).length,
      enrolled: applications.filter(
        (app) =>
          app.user_application_status === "enrolled" ||
          app.enrollment_status === "active",
      ).length,
      revenue: applications
        .filter((app) => app.payment_status === "completed" && app.amount_paid)
        .reduce((sum, app) => sum + (app.amount_paid || 0), 0),
      needs_reconciliation: applications.filter(
        (app) => app.needs_reconciliation,
      ).length,
    };

    res.status(200).json({
      success: true,
      data: {
        applications,
        stats,
      },
    });
  } catch (error) {
    log.error("Admin cohort applications error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export default withAdminAuth(handler);
