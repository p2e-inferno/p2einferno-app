import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "../../../lib/supabase/server";

// Simple approach: Return mock data for now, no database operations
// This allows us to test the UI without setting up database tables first
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method === "POST") {
      // Initialize Supabase client with admin privileges for API routes
      const supabase = createAdminClient();

      // Client sends user data from usePrivy() hook
      const { privyUserId, email, walletAddress, linkedWallets } = req.body;

      if (!privyUserId) {
        return res.status(400).json({ error: "Privy user ID required" });
      }

      let userProfile;
      try {
        // Check if user already exists in the database
        const { data: existingProfile, error: selectError } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("privy_user_id", privyUserId)
          .single();

        if (selectError && selectError.code !== "PGRST116") {
          // Log error but don't throw, as we may create a new profile below
          console.error("Error selecting user profile:", selectError);
        }

        if (existingProfile) {
          // Update existing profile with latest data
          const { data: updatedProfile, error: updateError } = await supabase
            .from("user_profiles")
            .update({
              email: email || existingProfile.email,
              wallet_address: walletAddress || existingProfile.wallet_address,
              linked_wallets: linkedWallets || existingProfile.linked_wallets,
              updated_at: new Date().toISOString(),
            })
            .eq("privy_user_id", privyUserId)
            .select()
            .single();

          if (updateError) {
            console.error("Error updating user profile:", updateError);
            throw updateError;
          }
          userProfile = updatedProfile;
        } else {
          // Create new profile
          const profileData = {
            privy_user_id: privyUserId,
            username:
              email?.split("@")[0] || `Infernal${privyUserId.slice(-6)}`,
            display_name:
              email?.split("@")[0] || `Infernal${privyUserId.slice(-6)}`,
            email: email || null,
            wallet_address: walletAddress || null,
            linked_wallets: linkedWallets || [],
            level: 1,
            experience_points: 100,
            status: "active",
            onboarding_completed: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const { data: newProfile, error: insertError } = await supabase
            .from("user_profiles")
            .insert([profileData])
            .select()
            .single();

          if (insertError) {
            console.error("Error creating user profile:", insertError);
            throw insertError;
          }
          userProfile = newProfile;

          try {
            // Log user registration activity
            const { error: activityError } = await supabase
              .from("user_activities")
              .insert([
                {
                  user_profile_id: newProfile.id,
                  activity_type: "user_registered",
                  points_earned: 100, // Welcome bonus
                  activity_data: { welcome_bonus: true },
                  created_at: new Date().toISOString(),
                },
              ]);

            if (activityError) {
              // Just log activity error but don't fail the request
              console.error("Error creating user activity:", activityError);
            }
          } catch (activityErr) {
            console.error("Exception in activity logging:", activityErr);
          }
        }
      } catch (profileErr) {
        console.error("Error in profile management:", profileErr);

        // Fall back to a mock profile as a last resort
        userProfile = {
          id: `mock_${privyUserId}`,
          privy_user_id: privyUserId,
          display_name:
            email?.split("@")[0] || `Infernal${privyUserId.slice(-6)}`,
          email: email || null,
          wallet_address: walletAddress || null,
          linked_wallets: linkedWallets || [],
          level: 1,
          experience_points: 100,
          status: "active",
          onboarding_completed: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }

      // Get dashboard data
      try {
        const dashboardData = await getUserDashboardData(
          userProfile.id,
          supabase
        );

        res.status(200).json({
          success: true,
          data: dashboardData,
        });
      } catch (dashboardErr) {
        console.error("Error fetching dashboard data:", dashboardErr);

        // Return a minimal response with just the profile data if dashboard data fails
        res.status(200).json({
          success: true,
          data: {
            profile: userProfile,
            applications: [],
            enrollments: [],
            recentActivities: [],
            stats: {
              totalApplications: 0,
              completedBootcamps: 0,
              totalPoints: userProfile.experience_points || 0,
              pendingPayments: 0,
            },
          },
        });
      }
    } else {
      res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error: any) {
    console.error("Simple profile API error:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      stack: error.stack,
    });

    res.status(500).json({
      error: "Failed to process request",
      details: error.message,
    });
  }
}

async function getUserDashboardData(userProfileId: string, supabase: any) {
  // Prepare empty results as fallbacks
  let applications = [];
  let enrollments = [];
  let recentActivities = [];
  let profile = null;

  try {
    // Get user applications with status using the view
    const { data: appsData, error: appsError } = await supabase
      .from("user_applications_view")
      .select("*")
      .eq("user_profile_id", userProfileId)
      .order("created_at", { ascending: false });

    if (appsError) {
      console.error("Error fetching applications:", appsError);
    } else {
      // Transform data to match expected structure
      applications =
        appsData?.map((app: any) => ({
          id: app.id,
          status: app.status,
          created_at: app.created_at,
          applications: {
            cohort_id: app.cohort_id,
            user_name: app.user_name,
            user_email: app.user_email,
            experience_level: app.experience_level,
          },
        })) || [];
    }
  } catch (err) {
    console.error("Exception fetching applications:", err);

    // Try the original query as fallback
    try {
      const { data: fallbackData } = await supabase
        .from("user_application_status")
        .select(
          `
          *,
          applications (
            cohort_id,
            user_name,
            user_email,
            experience_level,
            created_at
          )
        `
        )
        .eq("user_profile_id", userProfileId)
        .order("created_at", { ascending: false });

      applications = fallbackData || [];
    } catch (fallbackErr) {
      console.error("Fallback applications query failed:", fallbackErr);
    }
  }

  try {
    // Get bootcamp enrollments using the view
    const { data: enrollData, error: enrollError } = await supabase
      .from("user_enrollments_view")
      .select("*")
      .eq("user_profile_id", userProfileId);

    if (enrollError) {
      console.error("Error fetching enrollments:", enrollError);
    } else {
      // Transform data to match expected structure
      enrollments =
        enrollData?.map((enroll: any) => ({
          id: enroll.id,
          cohort_id: enroll.cohort_id,
          enrollment_status: enroll.enrollment_status,
          progress: enroll.progress,
          completion_date: enroll.completion_date,
          cohort: {
            id: enroll.cohort_id,
            name: enroll.cohort_name,
          },
        })) || [];
    }
  } catch (err) {
    console.error("Exception fetching enrollments:", err);

    // Try the original query as fallback
    try {
      const { data: fallbackData } = await supabase
        .from("bootcamp_enrollments")
        .select(
          `
          *,
          cohort (
            id,
            name
          )
        `
        )
        .eq("user_profile_id", userProfileId)
        .order("created_at", { ascending: false });

      enrollments = fallbackData || [];
    } catch (fallbackErr) {
      console.error("Fallback enrollments query failed:", fallbackErr);
    }
  }

  try {
    // Get recent activities
    const { data: activitiesData, error: activitiesError } = await supabase
      .from("user_activities")
      .select("*")
      .eq("user_profile_id", userProfileId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (activitiesError) {
      console.error("Error fetching activities:", activitiesError);
    } else {
      recentActivities = activitiesData || [];
    }
  } catch (err) {
    console.error("Exception fetching activities:", err);
  }

  try {
    // Get user profile
    const { data: profileData, error: profileError } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", userProfileId)
      .single();

    if (profileError) {
      console.error("Error fetching profile:", profileError);
    } else {
      profile = profileData;
    }
  } catch (err) {
    console.error("Exception fetching profile:", err);
  }

  // Calculate stats with safe fallbacks
  const stats = {
    totalApplications: applications?.length || 0,
    completedBootcamps:
      enrollments?.filter((e: any) => e.enrollment_status === "completed")
        .length || 0,
    totalPoints: profile?.experience_points || 0,
    pendingPayments:
      applications?.filter((a: any) => a.status === "pending").length || 0,
  };

  return {
    profile: profile || { id: userProfileId },
    applications,
    enrollments,
    recentActivities,
    stats,
  };
}
