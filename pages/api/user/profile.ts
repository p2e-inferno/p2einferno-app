import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:user:profile");

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
  userData: any,
): Promise<UserProfile> {
  // Extract data from multiple possible sources
  const email = userData.email?.address || userData.email || null;
  const walletAddress =
    userData.wallet?.address || userData.walletAddress || null;
  const linkedWallets =
    userData.linkedWallets ||
    userData.linkedAccounts
      ?.filter((acc: any) => acc.type === "wallet")
      ?.map((w: any) => w.address) ||
    [];

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

  if (profileError && profileError.code !== "PGRST116") {
    // PGRST116 is "not found", which is expected for new users
    log.error("Error checking existing profile:", profileError);
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
      log.error("Error updating profile:", error);
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
      log.error("Error creating profile:", error);

      // Check for unique constraint violation (email or wallet already exists)
      if (error?.code === "23505") {
        const constraintName = (error as any)?.constraint_name || "";

        if (constraintName === "user_profiles_email_unique") {
          throw new Error("This email address is already registered");
        } else if (constraintName === "user_profiles_wallet_address_unique") {
          throw new Error("This wallet address is already registered");
        } else {
          // Fallback for other unique constraint violations
          throw new Error("A profile with this information already exists");
        }
      }

      throw new Error(
        `Failed to create profile: ${error?.message || "Unknown error"}`,
      );
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
      log.error("Error logging registration activity:", activityError);
      // Don't fail the entire operation for logging errors
    }

    return data;
  }
}

async function getUserDashboardData(
  userProfileId: string,
): Promise<UserDashboardData> {
  // Get user profile
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", userProfileId)
    .single();

  if (profileError) {
    log.error("Error fetching user profile:", profileError);
    throw new Error(`Failed to fetch profile: ${profileError.message}`);
  }

  // Get user applications - query both ways to catch orphaned applications
  // First, get applications through user_application_status (normal path)
  const { data: statusApplications, error: statusAppError } = await supabase
    .from("user_application_status")
    .select(
      `
      *,
      applications (
        id,
        cohort_id,
        user_name,
        user_email,
        experience_level,
        payment_status,
        application_status,
        created_at
      )
    `,
    )
    .eq("user_profile_id", userProfileId)
    .order("created_at", { ascending: false });

  // Also check for orphaned applications directly
  const { data: orphanedApps, error: orphanedError } = await supabase
    .from("applications")
    .select("*")
    .eq("user_profile_id", userProfileId)
    .order("created_at", { ascending: false });

  // Merge the results, avoiding duplicates
  let applications = statusApplications || [];

  if (orphanedApps) {
    const existingAppIds = new Set(
      applications.map((a: any) => a.applications?.id).filter(Boolean),
    );

    orphanedApps.forEach((app: any) => {
      if (!existingAppIds.has(app.id)) {
        // Create a synthetic user_application_status record for orphaned apps
        applications.push({
          id: app.id,
          user_profile_id: userProfileId,
          application_id: app.id,
          status:
            app.payment_status === "completed"
              ? "completed"
              : app.payment_status === "failed"
                ? "failed"
                : "pending",
          created_at: app.created_at,
          applications: app,
          _is_orphaned: true,
        });
      }
    });
  }

  if (statusAppError && orphanedError) {
    log.error("Error fetching applications:", {
      statusAppError,
      orphanedError,
    });
  }

  // Get bootcamp enrollments (non-blocking)
  const { data: enrollments, error: enrollmentsError } = await supabase
    .from("bootcamp_enrollments")
    .select("*")
    .eq("user_profile_id", userProfileId)
    .order("created_at", { ascending: false });

  if (enrollmentsError) {
    log.error("Error fetching enrollments:", enrollmentsError);
  }

  // Get recent activities (non-blocking)
  const { data: recentActivities, error: activitiesError } = await supabase
    .from("user_activities")
    .select("*")
    .eq("user_profile_id", userProfileId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (activitiesError) {
    log.error("Error fetching activities:", activitiesError);
  }

  // Get quest completion statistics (non-blocking)
  const { data: questProgress, error: questError } = await supabase
    .from("user_quest_progress")
    .select("*")
    .eq("user_id", profile.privy_user_id)
    .eq("is_completed", true);

  if (questError) {
    log.error("Error fetching quest progress:", questError);
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
        const application = Array.isArray(_a.applications)
          ? _a.applications[0]
          : _a.applications;
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
  res: NextApiResponse,
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
        userDataForProfile,
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
    log.error("User profile API error:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      fullError: error,
    });

    // Return 409 Conflict for duplicate email/wallet errors
    if (
      error.message?.includes("already registered") ||
      error.message?.includes("email address is already") ||
      error.message?.includes("wallet address is already")
    ) {
      return res.status(409).json({
        error: error.message,
      });
    }

    res.status(500).json({
      error: "Failed to process request",
      details: error.message,
      errorType: error.name,
    });
  }
}
