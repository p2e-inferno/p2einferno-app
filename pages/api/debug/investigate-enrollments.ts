import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createAdminClient();
    
    // Get all enrollment records with details
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from("bootcamp_enrollments")
      .select(`
        id,
        user_profile_id,
        cohort_id,
        enrollment_status,
        created_at,
        updated_at,
        cohorts (
          id,
          name,
          bootcamp_program:bootcamp_program_id (name)
        )
      `)
      .order("updated_at", { ascending: false });

    if (enrollmentsError) {
      throw enrollmentsError;
    }

    // Get all user_journey_preferences records
    const { data: preferences, error: preferencesError } = await supabase
      .from("user_journey_preferences")
      .select("*")
      .order("created_at", { ascending: false });

    if (preferencesError) {
      console.log("Preferences table might not exist yet:", preferencesError.message);
    }

    // Get user profiles to understand user mapping
    const { data: profiles, error: profilesError } = await supabase
      .from("user_profiles")
      .select("id, privy_user_id, display_name")
      .order("created_at", { ascending: false });

    if (profilesError) {
      throw profilesError;
    }

    res.status(200).json({
      success: true,
      data: {
        enrollments: enrollments || [],
        enrollmentCount: enrollments?.length || 0,
        statusBreakdown: enrollments?.reduce((acc: any, curr: any) => {
          acc[curr.enrollment_status] = (acc[curr.enrollment_status] || 0) + 1;
          return acc;
        }, {}) || {},
        preferences: preferences || [],
        preferencesCount: preferences?.length || 0,
        profiles: profiles || []
      }
    });

  } catch (error: any) {
    console.error("Error investigating enrollments:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to investigate enrollments"
    });
  }
}