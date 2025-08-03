import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "../../../lib/supabase/server";

// Simplified user profile endpoint that doesn't rely on Privy token verification
const supabase = createAdminClient();

interface UserProfile {
  id: string;
  privy_user_id: string;
  username?: string;
  display_name?: string;
  email?: string;
  wallet_address?: string;
  linked_wallets: string[];
  avatar_url?: string;
  level: number;
  experience_points: number;
  status: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

interface UserDashboardData {
  profile: UserProfile;
  applications: any[];
  enrollments: any[];
  recentActivities: any[];
  stats: {
    totalApplications: number;
    completedBootcamps: number;
    totalPoints: number;
    pendingPayments: number;
    questsCompleted: number;
  };
}

async function createOrUpdateUserProfile(
  privyUserId: string,
  userData: any
): Promise<UserProfile> {
  // Extract data from request body
  const email = userData.email || null;
  const walletAddress = userData.walletAddress || null;
  const linkedWallets = userData.linkedWallets || [];
  
  const profileData = {
    privy_user_id: privyUserId,
    email: email,
    wallet_address: walletAddress,
    linked_wallets: linkedWallets,
    display_name:
      email?.split("@")[0] ||
      (walletAddress
        ? `Wallet${walletAddress.slice(-6)}`
        : `Infernal${privyUserId.slice(-6)}`),
  };

  // Check if profile exists
  const { data: existingProfile, error: profileError } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("privy_user_id", privyUserId)
    .single();

  if (profileError && profileError.code !== 'PGRST116') {
    console.error("Error checking existing profile:", profileError);
    throw new Error(`Database error: ${profileError.message}`);
  }

  if (existingProfile) {
    // Update existing profile
    const { data, error } = await supabase
      .from("user_profiles")
      .update(profileData)
      .eq("privy_user_id", privyUserId)
      .select()
      .single();

    if (error) {
      console.error("Error updating profile:", error);
      throw new Error(`Failed to update profile: ${error.message}`);
    }
    return data;
  } else {
    // Create new profile
    const { data, error } = await supabase
      .from("user_profiles")
      .insert([profileData])
      .select()
      .single();

    if (error) {
      console.error("Error creating profile:", error);
      throw new Error(`Failed to create profile: ${error.message}`);
    }

    // Log user registration activity (non-blocking)
    try {
      await supabase.from("user_activities").insert([
        {
          user_profile_id: data.id,
          activity_type: "user_registered",
          points_earned: 100, // Welcome bonus
          activity_data: { welcome_bonus: true },
        },
      ]);
    } catch (activityError) {
      console.error("Error logging registration activity:", activityError);
    }

    return data;
  }
}

async function getUserDashboardData(
  userProfileId: string
): Promise<UserDashboardData> {
  // Get user profile
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", userProfileId)
    .single();

  if (profileError) {
    console.error("Error fetching user profile:", profileError);
    throw new Error(`Failed to fetch profile: ${profileError.message}`);
  }

  // Get user applications with status (graceful fallback)
  const { data: applications } = await supabase
    .from("user_application_status")
    .select(
      `
      *,
      applications (
        cohort_id,
        user_name,
        user_email,
        experience_level,
        payment_status,
        application_status,
        created_at
      )
    `
    )
    .eq("user_profile_id", userProfileId)
    .order("created_at", { ascending: false });

  // Get bootcamp enrollments (graceful fallback)
  const { data: enrollments } = await supabase
    .from("bootcamp_enrollments")
    .select("*")
    .eq("user_profile_id", userProfileId)
    .order("created_at", { ascending: false });

  // Get recent activities (graceful fallback)
  const { data: recentActivities } = await supabase
    .from("user_activities")
    .select("*")
    .eq("user_profile_id", userProfileId)
    .order("created_at", { ascending: false })
    .limit(10);

  // Get quest completion statistics (graceful fallback)
  const { data: questProgress } = await supabase
    .from("user_quest_progress")
    .select("*")
    .eq("user_id", profile.privy_user_id)
    .eq("is_completed", true);

  // Calculate stats with safe defaults
  const stats = {
    totalApplications: applications?.length || 0,
    completedBootcamps:
      enrollments?.filter((_e: any) => _e.enrollment_status === "completed")
        .length || 0,
    totalPoints: profile.experience_points || 0,
    pendingPayments:
      applications?.filter((_a: any) => _a.applications?.payment_status === "pending").length || 0,
    questsCompleted: questProgress?.length || 0,
  };

  return {
    profile,
    applications: applications || [],
    enrollments: enrollments || [],
    recentActivities: recentActivities || [],
    stats,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Get privyUserId from request body directly
    const { privyUserId } = req.body;

    if (!privyUserId) {
      return res.status(400).json({ error: "privyUserId is required in request body" });
    }

    console.log(`Processing profile request for user: ${privyUserId}`);

    // Create or update user profile
    const profile = await createOrUpdateUserProfile(privyUserId, req.body);

    // Get dashboard data
    const dashboardData = await getUserDashboardData(profile.id);

    res.status(200).json({
      success: true,
      data: dashboardData,
    });

  } catch (error: any) {
    console.error("Simple user profile API error:", {
      message: error.message,
      stack: error.stack,
      privyUserId: req.body?.privyUserId,
    });
    
    res.status(500).json({
      error: "Failed to process request",
      details: error.message,
      errorType: error.name || "UnknownError",
    });
  }
}