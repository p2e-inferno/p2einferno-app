import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";

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

  // Check if profile exists with retry logic for network issues
  let existingProfile;
  let retryCount = 0;
  const maxRetries = 3;
  
  while (retryCount < maxRetries) {
    try {
      const { data, error: profileError } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("privy_user_id", privyUserId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        console.error("Error checking existing profile:", {
          message: profileError.message || 'Unknown error',
          code: profileError.code || 'NO_CODE',
          details: profileError.details || 'No details'
        });
        throw new Error(`Database error: ${profileError.message || 'Unknown database error'}`);
      }
      
      existingProfile = data;
      break; // Success, exit retry loop
      
    } catch (error) {
      retryCount++;
      console.error(`Attempt ${retryCount} failed for profile check:`, {
        message: error instanceof Error ? error.message : 'Unknown error',
        isNetworkError: error instanceof Error && error.message.includes('fetch failed')
      });
      
      if (retryCount >= maxRetries) {
        throw new Error(`Network error after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
    }
  }

  // Helper function to retry database operations
  const executeWithRetry = async (operation: () => Promise<any>, operationName: string) => {
    let retryCount = 0;
    while (retryCount < maxRetries) {
      try {
        return await operation();
      } catch (error) {
        retryCount++;
        console.error(`${operationName} attempt ${retryCount} failed:`, {
          message: error instanceof Error ? error.message : 'Unknown error',
          isNetworkError: error instanceof Error && error.message.includes('fetch failed')
        });
        
        if (retryCount >= maxRetries) {
          throw new Error(`${operationName} failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }
  };

  if (existingProfile) {
    // Update existing profile with retry
    const { data } = await executeWithRetry(async () => {
      const result = await supabase
        .from("user_profiles")
        .update(profileData)
        .eq("privy_user_id", privyUserId)
        .select()
        .single();
      
      if (result.error) {
        throw new Error(`Failed to update profile: ${result.error.message || 'Unknown error'}`);
      }
      return result;
    }, "Profile update");

    return data;
  } else {
    // Create new profile with retry
    const { data } = await executeWithRetry(async () => {
      const result = await supabase
        .from("user_profiles")
        .insert([profileData])
        .select()
        .single();
      
      if (result.error) {
        throw new Error(`Failed to create profile: ${result.error.message || 'Unknown error'}`);
      }
      return result;
    }, "Profile creation");

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
    `
    )
    .eq("user_profile_id", userProfileId)
    .order("created_at", { ascending: false });

  // Get bootcamp enrollments with cohort details (graceful fallback)
  const { data: enrollments } = await supabase
    .from("bootcamp_enrollments")
    .select(`
      *,
      cohorts (
        id,
        name,
        bootcamp_program:bootcamp_program_id (
          name
        )
      )
    `)
    .eq("user_profile_id", userProfileId)
    .order("created_at", { ascending: false });

  // Get user journey preferences separately
  const { data: preferences } = await supabase
    .from("user_journey_preferences")
    .select("enrollment_id, is_hidden")
    .eq("user_profile_id", userProfileId);

  // Merge preferences into enrollments
  const enrollmentsWithPreferences = (enrollments || []).map((enrollment: any) => {
    const preference = preferences?.find((p: any) => p.enrollment_id === enrollment.id);
    return {
      ...enrollment,
      user_journey_preferences: preference ? [preference] : []
    };
  });

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
      enrollments?.filter((_e: any) => 
        _e.enrollment_status === "enrolled" || _e.enrollment_status === "active"
      ).length || 0,
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
    enrollments: enrollmentsWithPreferences || [],
    recentActivities: recentActivities || [],
    stats,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Set a timeout for the entire request
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Request timeout after 30 seconds')), 30000);
  });

  try {
    // Race the actual handler against the timeout
    const result = await Promise.race([
      handleRequest(req, res),
      timeoutPromise
    ]);
    return result;
  } catch (error) {
    console.error("Simple user profile API error:", {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      privyUserId: req.body?.privyUserId
    });

    if (error instanceof Error && error.message.includes('timeout')) {
      return res.status(504).json({ 
        error: "Request timeout - please try again", 
        details: "The request took too long to complete" 
      });
    }

    return res.status(500).json({ 
      error: "Internal server error", 
      details: "Please try again later" 
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
    return res.status(400).json({ error: "privyUserId is required in request body" });
  }

  console.log(`Processing profile request for user: ${privyUserId}`);

  // Create or update user profile
  const profile = await createOrUpdateUserProfile(privyUserId, req.body);

  // Get dashboard data
  const dashboardData = await getUserDashboardData(profile.id);

  return res.status(200).json({
    success: true,
    data: dashboardData,
  });
}