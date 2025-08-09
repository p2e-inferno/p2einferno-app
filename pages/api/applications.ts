import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { createPrivyClient } from "../../lib/privyUtils";

const supabase = createAdminClient();
const client = createPrivyClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const applicationData = req.body;

    // Get authorization token
    const authToken = req.headers.authorization?.replace("Bearer ", "");
    let userProfileId: string | null = null;

    if (authToken) {
      try {
        const verifiedClaims = await client.verifyAuthToken(authToken);
        const privyUserId = verifiedClaims.userId;

        // Get user profile
        const { data: userProfile } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("privy_user_id", privyUserId)
          .single();

        userProfileId = userProfile?.id || null;
      } catch (error) {
        console.log(
          "Auth token verification failed, proceeding without user link"
        );
      }
    }
    console.log("privyUserId", userProfileId);

    // Validate required fields
    const requiredFields = [
      "cohort_id",
      "user_email",
      "user_name",
      "phone_number",
      "experience_level",
      "motivation",
      "goals",
    ];

    for (const field of requiredFields) {
      if (!applicationData[field]) {
        return res.status(400).json({
          error: `Missing required field: ${field}`,
        });
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(applicationData.user_email)) {
      return res.status(400).json({
        error: "Invalid email format",
      });
    }

    // Set default values for application
    const completeApplicationData = {
      ...applicationData,
      payment_status: "pending",
      application_status: "draft",
      payment_method: applicationData.payment_method || "fiat",
      user_profile_id: userProfileId, // Add direct relationship
    };

    const { data, error } = await supabase
      .from("applications")
      .insert([completeApplicationData])
      .select("id")
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({
        error: "Failed to save application. Please try again.",
      });
    }

    // If we have a user profile ID, create the link
    if (userProfileId && data?.id) {
      await supabase.from("user_application_status").insert([
        {
          user_profile_id: userProfileId,
          application_id: data.id,
          status: "pending",
        },
      ]);
    }

    res.status(201).json({
      success: true,
      data: {
        applicationId: data.id,
      },
      message: "Application saved successfully",
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({
      error: "An unexpected error occurred. Please try again.",
    });
  }
}
