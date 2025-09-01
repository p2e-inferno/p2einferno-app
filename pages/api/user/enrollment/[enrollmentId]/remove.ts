import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import type { ApiResponse } from "@/lib/api";

interface RemoveEnrollmentResponse {
  success: boolean;
  message: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<RemoveEnrollmentResponse>>
) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ 
      success: false, 
      error: "Method not allowed" 
    });
  }

  try {
    const supabase = createAdminClient();
    const user = await getPrivyUser(req);
    
    if (!user?.id) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const { enrollmentId } = req.query;

    if (!enrollmentId || typeof enrollmentId !== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid enrollment ID"
      });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, privy_user_id")
      .eq("privy_user_id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return res.status(404).json({
        success: false,
        error: "User profile not found",
      });
    }

    // Verify the enrollment belongs to the user
    const { data: enrollment, error: enrollmentError } = await supabase
      .from("bootcamp_enrollments")
      .select("id, user_profile_id, enrollment_status")
      .eq("id", enrollmentId)
      .eq("user_profile_id", profile.id)
      .maybeSingle();

    if (enrollmentError || !enrollment) {
      return res.status(404).json({
        success: false,
        error: "Enrollment not found or you don't have access to it",
      });
    }

    // Create or update user preference to hide this journey from lobby
    const { error: preferenceError } = await supabase
      .from("user_journey_preferences")
      .upsert({
        user_profile_id: profile.id,
        enrollment_id: enrollmentId,
        is_hidden: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_profile_id,enrollment_id'
      });

    if (preferenceError) {
      throw new Error(`Failed to hide journey: ${preferenceError.message}`);
    }

    res.status(200).json({
      success: true,
      data: {
        success: true,
        message: "Journey removed from lobby successfully"
      }
    });

  } catch (error: any) {
    console.error("Error removing enrollment:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to remove journey",
    });
  }
}