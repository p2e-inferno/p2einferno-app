import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { withAdminAuth } from "../../../../lib/auth/admin-auth";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:admin:applications:fix-orphaned");

/**
 * Fix orphaned applications that exist without user_application_status records
 * POST /api/admin/applications/fix-orphaned
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createAdminClient();

    // Call the database function to fix orphaned applications
    const { data, error } = await supabase.rpc("fix_orphaned_applications");

    if (error) {
      log.error("Error fixing orphaned applications:", error);
      return res.status(500).json({
        error: "Failed to fix orphaned applications",
        details: error.message,
      });
    }

    log.info("Fixed orphaned applications:", data);

    // Count how many were fixed
    const fixedCount = data?.length || 0;
    const successCount =
      data?.filter(
        (r: any) => !r.action_taken.includes("No user profile found"),
      ).length || 0;

    res.status(200).json({
      success: true,
      message: `Fixed ${successCount} out of ${fixedCount} orphaned applications`,
      results: data,
      summary: {
        total_orphaned: fixedCount,
        successfully_fixed: successCount,
        failed: fixedCount - successCount,
      },
    });
  } catch (error) {
    log.error("Error in fix-orphaned handler:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export default withAdminAuth(handler);
