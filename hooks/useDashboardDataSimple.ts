import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "react-hot-toast";

export interface UserProfile {
  id: string;
  privy_user_id: string;
  display_name: string;
  email: string;
  wallet_address: string;
  linked_wallets: string[];
  level: number;
  experience_points: number;
  status: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Enrollment {
  id: string;
  user_profile_id: string;
  cohort_id: string;
  enrollment_status: string;
  progress: {
    modules_completed: number;
    total_modules: number;
  };
  cohort?: {
    id: string;
    name: string;
  };
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  user_profile_id: string;
  application_id: string;
  status: string;
  applications?: {
    cohort_id: string;
    user_name: string;
    experience_level: string;
    created_at: string;
  };
  created_at: string;
}

export interface Activity {
  id: string;
  user_profile_id: string;
  activity_type: string;
  activity_data: any;
  points_earned: number;
  created_at: string;
}

export interface UserDashboardData {
  profile: UserProfile;
  applications: Application[];
  enrollments: Enrollment[];
  recentActivities: Activity[];
  stats: {
    totalApplications: number;
    completedBootcamps: number;
    totalPoints: number;
    pendingPayments: number;
  };
}

interface UseDashboardDataResult {
  data: UserDashboardData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useDashboardDataSimple = (): UseDashboardDataResult => {
  const [data, setData] = useState<UserDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, authenticated, ready } = usePrivy();

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!user) {
        throw new Error("No user data available");
      }

      // Use client-side user data directly
      const userData = {
        privyUserId: user.id,
        email: user.email?.address,
        walletAddress: user.wallet?.address,
        linkedWallets:
          user.linkedAccounts
            ?.filter((acc) => acc.type === "wallet")
            ?.map((w) => w.address) || [],
      };

      const response = await fetch("/api/user/profile-simple", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch dashboard data");
      }

      const result = await response.json();
      setData(result.data);
    } catch (err: any) {
      console.error("Dashboard data fetch error:", err);
      setError(err.message);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready && authenticated && user) {
      fetchDashboardData();
    } else if (ready && !authenticated) {
      setLoading(false);
    }
  }, [ready, authenticated, user]);

  return {
    data,
    loading,
    error,
    refetch: fetchDashboardData,
  };
};
