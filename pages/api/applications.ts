import { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../lib/supabase";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const applicationData = req.body;

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

    res.status(201).json({
      success: true,
      applicationId: data.id,
      message: "Application saved successfully",
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({
      error: "An unexpected error occurred. Please try again.",
    });
  }
}
