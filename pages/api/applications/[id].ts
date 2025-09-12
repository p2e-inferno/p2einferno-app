import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:applications:[id]");

const supabase = createAdminClient();

/**
 * Handle application operations by ID
 * DELETE /api/applications/[id] - Cancel/delete an application
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { id } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).json({
      error: "Invalid application ID",
    });
  }

  if (req.method === "DELETE") {
    return handleDeleteApplication(res, id);
  }

  return res.status(405).json({ error: "Method not allowed" });
}

/**
 * Cancel/delete an application and cleanup related data
 */
async function handleDeleteApplication(
  res: NextApiResponse,
  applicationId: string,
) {
  try {
    // First, check if the application exists and get its current status
    const { data: application, error: fetchError } = await supabase
      .from("applications")
      .select("id, payment_status, user_email")
      .eq("id", applicationId)
      .single();

    if (fetchError || !application) {
      return res.status(404).json({
        error: "Application not found",
      });
    }

    // Don't allow deletion of completed applications
    if (application.payment_status === "completed") {
      return res.status(400).json({
        error:
          "Cannot cancel a completed application. Contact support if needed.",
      });
    }

    log.info(
      `Canceling application ${applicationId} for user ${application.user_email}`,
    );

    // Delete related payment transactions first (CASCADE should handle this, but being explicit)
    const { error: paymentDeleteError } = await supabase
      .from("payment_transactions")
      .delete()
      .eq("application_id", applicationId);

    if (paymentDeleteError) {
      log.error("Failed to delete payment transactions:", paymentDeleteError);
      // Continue anyway - the CASCADE should clean this up
    }

    // Delete the application
    const { error: deleteError } = await supabase
      .from("applications")
      .delete()
      .eq("id", applicationId);

    if (deleteError) {
      log.error("Failed to delete application:", deleteError);
      return res.status(500).json({
        error: "Failed to cancel application. Please try again.",
      });
    }

    log.info(`Successfully cancelled application ${applicationId}`);

    res.status(200).json({
      success: true,
      message: "Application cancelled successfully",
    });
  } catch (error) {
    log.error("Error canceling application:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
}
