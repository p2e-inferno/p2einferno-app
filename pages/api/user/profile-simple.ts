import { NextApiRequest, NextApiResponse } from "next";

// Simple approach: Return mock data for now, no database operations
// This allows us to test the UI without setting up database tables first
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method === "POST") {
      // Client sends user data from usePrivy() hook
      const { privyUserId, email, walletAddress, linkedWallets } = req.body;

      if (!privyUserId) {
        return res.status(400).json({ error: "Privy user ID required" });
      }

      // Create mock profile data based on user input
      const mockProfile = {
        id: `profile_${privyUserId}`,
        privy_user_id: privyUserId,
        username: email?.split("@")[0] || `Infernal${privyUserId.slice(-6)}`,
        display_name:
          email?.split("@")[0] || `Infernal${privyUserId.slice(-6)}`,
        email: email || "No email",
        wallet_address: walletAddress || "No wallet",
        linked_wallets: linkedWallets || [],
        avatar_url: null,
        level: 1,
        experience_points: 100,
        status: "active",
        onboarding_completed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Get mock dashboard data
      const dashboardData = getDashboardData(mockProfile);

      res.status(200).json({
        success: true,
        data: dashboardData,
      });
    } else {
      res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error: any) {
    console.error("Simple profile API error:", error);
    res.status(500).json({
      error: "Failed to process request",
      details: error.message,
    });
  }
}

function getDashboardData(profile: any) {
  // Return mock dashboard data for testing
  return {
    profile: profile,
    applications: [
      {
        id: "app_1",
        status: "pending",
        created_at: new Date().toISOString(),
        applications: {
          cohort_id: "infernal-sparks-jan-2024",
          user_name: profile.display_name,
          experience_level: "intermediate",
        },
      },
    ],
    enrollments: [
      {
        id: "enrollment_1",
        cohort_id: "web3-fundamentals-dec-2023",
        enrollment_status: "completed",
        progress: { modules_completed: 8, total_modules: 8 },
        completion_date: "2023-12-15T00:00:00Z",
      },
    ],
    recentActivities: [
      {
        id: "activity_1",
        activity_type: "user_registered",
        activity_data: { welcome_bonus: true },
        points_earned: 100,
        created_at: new Date().toISOString(),
      },
    ],
    stats: {
      totalApplications: 1,
      completedBootcamps: 1,
      totalPoints: 100,
      pendingPayments: 1,
    },
  };
}
