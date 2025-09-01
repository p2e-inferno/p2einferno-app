import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "react-hot-toast";

interface EnrollmentWithDetails {
  id: string;
  enrollment_status: string;
  progress: {
    modules_completed: number;
    total_modules: number;
  };
  completion_date?: string;
  created_at: string;
  updated_at: string;
  cohort: {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    status: string;
    bootcamp_program: {
      id: string;
      name: string;
      description: string;
      duration_weeks: number;
      max_reward_dgt: number;
      image_url?: string;
    };
  };
  milestone_progress?: {
    total_milestones: number;
    completed_milestones: number;
    current_milestone?: {
      id: string;
      name: string;
      progress_percentage: number;
    };
  };
}

interface UseUserEnrollmentsResult {
  enrollments: EnrollmentWithDetails[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useUserEnrollments = (): UseUserEnrollmentsResult => {
  const [enrollments, setEnrollments] = useState<EnrollmentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { authenticated, ready, getAccessToken } = usePrivy();

  const fetchEnrollments = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!authenticated) {
        setEnrollments([]);
        return;
      }

      const token = await getAccessToken();
      if (!token) {
        throw new Error("Authentication required");
      }

      const response = await fetch("/api/user/enrollments", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        // 404: profile not found or created yet. Treat as empty state, not fatal.
        if (response.status === 404) {
          setEnrollments([]);
          setError(null);
          return;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch enrollments");
      }

      const result = await response.json();
      setEnrollments(result.data || []);
    } catch (err: any) {
      console.error("Enrollments fetch error:", err);
      setError(err.message);
      toast.error("Failed to load enrollments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready) {
      fetchEnrollments();
    }
  }, [ready, authenticated]);

  return {
    enrollments,
    loading,
    error,
    refetch: fetchEnrollments,
  };
};