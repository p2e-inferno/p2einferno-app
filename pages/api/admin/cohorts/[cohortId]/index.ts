import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { withAdminAuth } from "@/lib/auth/admin-auth";

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

    // Get cohort details with bootcamp program info - with retry logic for network failures
    let retryCount = 0;
    const maxRetries = 3;
    let cohort, cohortError;
    
    while (retryCount < maxRetries) {
      try {
        const result = await supabase
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
          
        cohort = result.data;
        cohortError = result.error;
        break; // Success, exit retry loop
      } catch (networkError) {
        retryCount++;
        console.warn(`[COHORT_API] Database connection attempt ${retryCount}/${maxRetries} failed:`, networkError);
        
        if (retryCount >= maxRetries) {
          cohortError = {
            message: 'Database connection failed after retries',
            details: networkError instanceof Error ? networkError.message : 'Network error'
          };
          cohort = null;
        } else {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
    }


    if (cohortError) {
      console.error("Error fetching cohort:", cohortError);
      return res.status(500).json({ error: "Database error", details: cohortError.message });
    }
    
    if (!cohort) {
      console.error("Cohort not found:", cohortId);
      return res.status(404).json({ error: "Cohort not found", cohortId });
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

export default withAdminAuth(handler);