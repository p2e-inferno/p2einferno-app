import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "../../../lib/supabase/server";
import { createPrivyClient } from "../../../lib/privyUtils";

// Use admin client (service role) to bypass RLS for profile CRUD
const supabase = createAdminClient();

const client = createPrivyClient();

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
  };
}

async function createOrUpdateUserProfile(
  privyUserId: string,
  userData: any
): Promise<UserProfile> {
  const profileData = {
    privy_user_id: privyUserId,
    email: userData.email?.address || null,
    wallet_address: userData.wallet?.address || null,
    linked_wallets:
      userData.linkedAccounts
        ?.filter((acc: any) => acc.type === "wallet")
        .map((w: any) => w.address) || [],
    display_name:
      userData.email?.address?.split("@")[0] ||
      (userData.wallet?.address
        ? `Wallet${userData.wallet.address.slice(-6)}`
        : `Infernal${privyUserId.slice(-6)}`),
  };

  const { data: existingProfile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("privy_user_id", privyUserId)
    .single();

  if (existingProfile) {
    // Update existing profile
    const { data, error } = await supabase
      .from("user_profiles")
      .update(profileData)
      .eq("privy_user_id", privyUserId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    // Create new profile
    const { data, error } = await supabase
      .from("user_profiles")
      .insert([profileData])
      .select()
      .single();

    if (error) throw error;

    // Log user registration activity
    await supabase.from("user_activities").insert([
      {
        user_profile_id: data.id,
        activity_type: "user_registered",
        points_earned: 100, // Welcome bonus
        activity_data: { welcome_bonus: true },
      },
    ]);

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

  if (profileError) throw profileError;

  // Get user applications with status
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

  // Get bootcamp enrollments
  const { data: enrollments } = await supabase
    .from("bootcamp_enrollments")
    .select("*")
    .eq("user_profile_id", userProfileId)
    .order("created_at", { ascending: false });

  // Get recent activities
  const { data: recentActivities } = await supabase
    .from("user_activities")
    .select("*")
    .eq("user_profile_id", userProfileId)
    .order("created_at", { ascending: false })
    .limit(10);

  // Calculate stats
  const stats = {
    totalApplications: applications?.length || 0,
    completedBootcamps:
      enrollments?.filter((_e: any) => _e.enrollment_status === "completed")
        .length || 0,
    totalPoints: profile.experience_points || 0,
    pendingPayments:
      applications?.filter((_a: any) => _a.applications?.payment_status === "pending").length || 0,
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
    // Get authorization token from request
    const authToken = req.headers.authorization?.replace("Bearer ", "");
    if (!authToken) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    // Verify the token with Privy (best effort)
    let verifiedClaims: any;
    try {
      verifiedClaims = await client.verifyAuthToken(authToken);
    } catch (verifyErr) {
      console.error(
        "Privy token verification failed – falling back to body data",
        verifyErr
      );
    }

    const privyUserId = verifiedClaims?.userId || req.body?.privyUserId;

    if (!privyUserId) {
      return res
        .status(401)
        .json({ error: "Invalid user token and no privyUserId provided" });
    }

    if (req.method === "GET" || req.method === "POST") {
      // Choose the richest source of user data we have
      const userDataForProfile = verifiedClaims || req.body;

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
