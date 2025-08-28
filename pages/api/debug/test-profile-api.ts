import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createAdminClient();
    
    const privyUserId = "did:privy:cm9xjtnrf00itic0mhcles9tp"; // The user I see in the data
    
    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("privy_user_id", privyUserId)
      .single();

    if (profileError) {
      throw new Error(`Profile error: ${profileError.message}`);
    }

    console.log("Found profile:", profile);

    // Test the exact query from profile-simple.ts
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from("bootcamp_enrollments")
      .select(`
        *,
        cohorts (
          id,
          name,
          bootcamp_program:bootcamp_program_id (
            name
          )
        ),
        user_journey_preferences (
          id,
          is_hidden
        )
      `)
      .eq("user_profile_id", profile.id)
      .order("created_at", { ascending: false });

    console.log("Enrollments query error:", enrollmentsError);
    console.log("Enrollments raw data:", enrollments);

    if (enrollmentsError) {
      throw new Error(`Enrollments error: ${enrollmentsError.message}`);
    }

    // Test the filtering logic from the frontend
    const visibleEnrollments = (enrollments || []).filter((enrollment: any) => {
      console.log("Processing enrollment:", enrollment.id, "preferences:", enrollment.user_journey_preferences);
      
      if (!enrollment.user_journey_preferences || enrollment.user_journey_preferences.length === 0) {
        console.log("No preferences, showing enrollment");
        return true;
      }
      const isHidden = enrollment.user_journey_preferences[0]?.is_hidden;
      console.log("Has preferences, is_hidden:", isHidden);
      return !isHidden;
    });

    console.log("Visible enrollments count:", visibleEnrollments.length);

    res.status(200).json({
      success: true,
      data: {
        profile,
        rawEnrollments: enrollments || [],
        visibleEnrollments,
        counts: {
          total: enrollments?.length || 0,
          visible: visibleEnrollments.length
        }
      }
    });

  } catch (error: any) {
    console.error("Test API error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to test API"
    });
  }
}