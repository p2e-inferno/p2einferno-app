import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "../../../../../lib/auth/privy";

const supabase = createAdminClient();

/**
 * Get cohort details
 * GET /api/admin/cohorts/[cohortId]
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Verify admin authentication
    const user = await getPrivyUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { cohortId } = req.query;

    if (!cohortId || typeof cohortId !== "string") {
      return res.status(400).json({ error: "Invalid cohort ID" });
    }

    // Get cohort details with bootcamp program info
    const { data: cohort, error: cohortError } = await supabase
      .from("cohorts")
      .select(`
        id,
        name,
        start_date,
        end_date,
        max_participants,
        current_participants,
        registration_deadline,
        status,
        bootcamp_programs!cohorts_bootcamp_program_id_fkey (
          name,
          description,
          duration_weeks,
          max_reward_dgt
        )
      `)
      .eq("id", cohortId)
      .single();

    if (cohortError || !cohort) {
      return res.status(404).json({ error: "Cohort not found" });
    }

    // Flatten the response structure
    const response = {
      id: cohort.id,
      name: cohort.name,
      start_date: cohort.start_date,
      end_date: cohort.end_date,
      max_participants: cohort.max_participants,
      current_participants: cohort.current_participants,
      registration_deadline: cohort.registration_deadline,
      status: cohort.status,
      bootcamp_program: Array.isArray(cohort.bootcamp_programs) 
        ? cohort.bootcamp_programs[0] 
        : cohort.bootcamp_programs
    };

    res.status(200).json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error("Admin cohort details error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}