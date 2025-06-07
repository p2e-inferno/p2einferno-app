import { useState, useEffect } from "react";
import { getAccessToken } from "@privy-io/react-auth";
import { toast } from "react-hot-toast";

export interface UserProfile {
  id: string;
  privy_user_id: string;
  username?: string;
  display_name: string;
  email: string;
  wallet_address: string;
  linked_wallets: string[];
  avatar_url?: string;
  level: number;
  experience_points: number;
  status: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApplicationStatus {
  id: string;
  status: "pending" | "completed" | "failed" | "expired";
  payment_intent_id?: string;
  payment_method?: string;
  amount_paid?: number;
  currency?: string;
  completed_at?: string;
  created_at: string;
  applications: {
    cohort_id: string;
    user_name: string;
    user_email: string;
    experience_level: string;
    created_at: string;
  };
}

export interface BootcampEnrollment {
  id: string;
  cohort_id: string;
  enrollment_status: "enrolled" | "completed" | "dropped" | "suspended";
  progress: any;
  completion_date?: string;
  certificate_issued: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserActivity {
  id: string;
  activity_type: string;
  activity_data: any;
  points_earned: number;
  created_at: string;
}

export interface DashboardStats {
  totalApplications: number;
  completedBootcamps: number;
  totalPoints: number;
  pendingPayments: number;
}

export interface UserDashboardData {
  profile: UserProfile;
  applications: ApplicationStatus[];
  enrollments: BootcampEnrollment[];
  recentActivities: UserActivity[];
  stats: DashboardStats;
}

interface UseDashboardDataResult {
  data: UserDashboardData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
}

export const useDashboardData = (): UseDashboardDataResult => {
  const [data, setData] = useState<UserDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("No access token available");
      }

      const response = await fetch("/api/user/profile", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
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

  const updateProfile = async (updates: Partial<UserProfile>) => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("No access token available");
      }

      const response = await fetch("/api/user/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update profile");
      }

      const result = await response.json();

      // Update local data
      if (data) {
        setData({
          ...data,
          profile: { ...data.profile, ...result.data },
        });
      }

      toast.success("Profile updated successfully");
    } catch (err: any) {
      console.error("Profile update error:", err);
      toast.error(err.message || "Failed to update profile");
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  return {
    data,
    loading,
    error,
    refetch: fetchDashboardData,
    updateProfile,
  };
};
