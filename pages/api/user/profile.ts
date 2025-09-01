import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";

// Use admin client (service role) to bypass RLS for profile CRUD
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
  // Extract data from multiple possible sources
  const email = userData.email?.address || userData.email || null;
  const walletAddress = userData.wallet?.address || userData.walletAddress || null;
  const linkedWallets = userData.linkedWallets || 
    (userData.linkedAccounts
      ?.filter((acc: any) => acc.type === "wallet")
      ?.map((w: any) => w.address)) || [];
  
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

  const { data: existingProfile, error: profileError } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("privy_user_id", privyUserId)
    .single();

  if (profileError && profileError.code !== 'PGRST116') {
    // PGRST116 is "not found", which is expected for new users
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
      // Don't fail the entire operation for logging errors
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

  // Get user applications with status (non-blocking)
  const { data: applications, error: applicationsError } = await supabase
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
  
  if (applicationsError) {
    console.error("Error fetching applications:", applicationsError);
  }

  // Get bootcamp enrollments (non-blocking)
  const { data: enrollments, error: enrollmentsError } = await supabase
    .from("bootcamp_enrollments")
    .select("*")
    .eq("user_profile_id", userProfileId)
    .order("created_at", { ascending: false });
  
  if (enrollmentsError) {
    console.error("Error fetching enrollments:", enrollmentsError);
  }

  // Get recent activities (non-blocking)
  const { data: recentActivities, error: activitiesError } = await supabase
    .from("user_activities")
    .select("*")
    .eq("user_profile_id", userProfileId)
    .order("created_at", { ascending: false })
    .limit(10);
  
  if (activitiesError) {
    console.error("Error fetching activities:", activitiesError);
  }

  // Get quest completion statistics (non-blocking)
  const { data: questProgress, error: questError } = await supabase
    .from("user_quest_progress")
    .select("*")
    .eq("user_id", profile.privy_user_id)
    .eq("is_completed", true);
  
  if (questError) {
    console.error("Error fetching quest progress:", questError);
  }

  // Calculate stats
  const stats = {
    totalApplications: applications?.length || 0,
    completedBootcamps:
      enrollments?.filter((_e: any) => _e.enrollment_status === "completed")
        .length || 0,
    totalPoints: profile.experience_points || 0,
    pendingPayments:
      applications?.filter((_a: any) => {
        const application = Array.isArray(_a.applications) ? _a.applications[0] : _a.applications;
        return application?.payment_status === "pending";
      }).length || 0,
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
    // Get Privy user from request
    const privyUser = await getPrivyUser(req);
    const privyUserId = privyUser?.id;

    if (!privyUserId) {
      return res
        .status(401)
        .json({ error: "Invalid user token and no privyUserId provided" });
    }

    if (req.method === "GET" || req.method === "POST") {
      // Choose the richest source of user data we have
      const userDataForProfile = privyUser || req.body;

      const profile = await createOrUpdateUserProfile(
        privyUserId,
        userDataForProfile
      );

      // Get dashboard data
      const dashboardData = await getUserDashboardData(profile.id);

      res.status(200).json({
        success: true,
        data: dashboardData,
      });
    } else if (req.method === "PUT") {
      // Update user profile
      const updates = req.body;

      const { data, error } = await supabase
        .from("user_profiles")
        .update(updates)
        .eq("privy_user_id", privyUserId)
        .select()
        .single();

      if (error) throw error;

      res.status(200).json({
        success: true,
        data: data,
        message: "Profile updated successfully",
      });
    } else {
      res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error: any) {
    console.error("User profile API error:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      fullError: error,
    });
    res.status(500).json({
      error: "Failed to process request",
      details: error.message,
      errorType: error.name,
    });
  }
}
