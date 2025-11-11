import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:user:profile-simple");

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
    enrolledBootcamps: number;
    totalPoints: number;
    pendingPayments: number;
    questsCompleted: number;
  };
}

async function createOrUpdateUserProfile(
  privyUserId: string,
  userData: any,
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

  const maxRetries = 3;

  // Helper function to retry database operations
  const executeWithRetry = async (
    operation: () => Promise<any>,
    operationName: string,
  ) => {
    let retryCount = 0;
    while (retryCount < maxRetries) {
      try {
        return await operation();
      } catch (error) {
        retryCount++;
        log.error(`${operationName} attempt ${retryCount} failed:`, {
          message: error instanceof Error ? error.message : "Unknown error",
          isNetworkError:
            error instanceof Error && error.message.includes("fetch failed"),
        });

        if (retryCount >= maxRetries) {
          throw new Error(
            `${operationName} failed after ${maxRetries} attempts: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
      }
    }
  };

  log.info("Starting profile upsert operation", {
    privyUserId,
    walletAddress: profileData.wallet_address,
    operation: "upsert",
  });

  // Use atomic upsert operation to handle race conditions
  const { data } = await executeWithRetry(async () => {
    const result = await supabase
      .from("user_profiles")
      .upsert(profileData, {
        onConflict: "privy_user_id",
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (result.error) {
      // Check for unique constraint violation (email or wallet already exists)
      if (result.error?.code === "23505") {
        const constraintName = (result.error as any)?.constraint_name || "";

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
        `Failed to upsert profile: ${result.error?.message || "Unknown error"}`,
      );
    }
    return result;
  }, "Profile upsert");

  // Check if this was a new profile creation (for welcome bonus)
  // We can determine this by checking if created_at equals updated_at
  const isNewProfile = data.created_at === data.updated_at;

  log.info("Profile upsert completed successfully", {
    privyUserId,
    userId: data.id,
    isNewProfile,
    operation: isNewProfile ? "created" : "updated",
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  });

  // Log user registration activity for new profiles only (non-blocking)
  if (isNewProfile) {
    try {
      await supabase.from("user_activities").insert([
        {
          user_profile_id: data.id,
          activity_type: "user_registered",
          points_earned: 100, // Welcome bonus
          activity_data: { welcome_bonus: true },
        },
      ]);
      log.info("Logged user registration activity for new profile", {
        userId: data.id,
        privyUserId,
      });
    } catch (activityError) {
      // Don't fail profile creation if activity logging fails
      log.warn("Failed to log user registration activity:", {
        error:
          activityError instanceof Error
            ? activityError.message
            : "Unknown error",
        userId: data.id,
      });
    }
  }

  return data;
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

  // Get user applications with status and cohort details (graceful fallback)
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
        created_at,
        cohorts (
          id,
          name,
          bootcamp_program_id,
          bootcamp_programs (
            id,
            name
          )
        )
      )
    `,
    )
    .eq("user_profile_id", userProfileId)
    .order("created_at", { ascending: false });

  // Get bootcamp enrollments with cohort details (graceful fallback)
  const { data: enrollments } = await supabase
    .from("bootcamp_enrollments")
    .select(
      `
      *,
      cohorts (
        id,
        name,
        bootcamp_program:bootcamp_program_id (
          name
        )
      )
    `,
    )
    .eq("user_profile_id", userProfileId)
    .order("created_at", { ascending: false });

  // Get user journey preferences separately
  const { data: preferences } = await supabase
    .from("user_journey_preferences")
    .select("enrollment_id, is_hidden")
    .eq("user_profile_id", userProfileId);

  // Merge preferences into enrollments
  const enrollmentsWithPreferences = (enrollments || []).map(
    (enrollment: any) => {
      const preference = preferences?.find(
        (p: any) => p.enrollment_id === enrollment.id,
      );
      return {
        ...enrollment,
        user_journey_preferences: preference ? [preference] : [],
      };
    },
  );

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
    enrolledBootcamps:
      enrollments?.filter(
        (_e: any) =>
          _e.enrollment_status === "enrolled" ||
          _e.enrollment_status === "active",
      ).length || 0,
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
    enrollments: enrollmentsWithPreferences || [],
    recentActivities: recentActivities || [],
    stats,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Set a timeout for the entire request
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error("Request timeout after 30 seconds")),
      30000,
    );
  });

  try {
    // Race the actual handler against the timeout
    const result = await Promise.race([
      handleRequest(req, res),
      timeoutPromise,
    ]);
    return result;
  } catch (error) {
    log.error("Simple user profile API error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : "No stack trace",
      privyUserId: req.body?.privyUserId,
    });

    if (error instanceof Error && error.message.includes("timeout")) {
      return res.status(504).json({
        error: "Request timeout - please try again",
        details: "The request took too long to complete",
      });
    }

    return res.status(500).json({
      error: "Internal server error",
      details: "Please try again later",
    });
  }
}

async function handleRequest(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Get privyUserId from request body directly
  const { privyUserId } = req.body;

  if (!privyUserId) {
    return res
      .status(400)
      .json({ error: "privyUserId is required in request body" });
  }

  log.info(`Processing profile request for user: ${privyUserId}`);

  try {
    // Create or update user profile
    const profile = await createOrUpdateUserProfile(privyUserId, req.body);

    // Get dashboard data
    const dashboardData = await getUserDashboardData(profile.id);

    return res.status(200).json({
      success: true,
      data: dashboardData,
    });
  } catch (error: any) {
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

    // Re-throw other errors to be handled by outer catch
    throw error;
  }
}
