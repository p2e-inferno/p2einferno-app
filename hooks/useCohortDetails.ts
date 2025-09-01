import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import toast from "react-hot-toast";
import type { 
  BootcampProgram, 
  Cohort, 
  CohortMilestone, 
  MilestoneTask,
  ProgramHighlight,
  ProgramRequirement 
} from "@/lib/supabase/types";

interface MilestoneWithTasks extends CohortMilestone {
  milestone_tasks: MilestoneTask[];
}

interface CohortDetailsData {
  bootcamp: BootcampProgram;
  cohort: Cohort;
  milestones: MilestoneWithTasks[];
  highlights: ProgramHighlight[];
  requirements: ProgramRequirement[];
}

interface UseCohortDetailsResult {
  data: CohortDetailsData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useCohortDetails = (cohortId: string): UseCohortDetailsResult => {
  const [data, setData] = useState<CohortDetailsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { authenticated, getAccessToken } = usePrivy();

  const fetchCohortDetails = async () => {
    if (!cohortId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Build headers - include auth token if user is authenticated
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (authenticated) {
        try {
          const token = await getAccessToken();
          if (token) {
            headers.Authorization = `Bearer ${token}`;
          }
        } catch (tokenError) {
          console.warn("Could not get access token:", tokenError);
          // Continue without token for public data
        }
      }

      const response = await fetch(`/api/cohorts/${cohortId}`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch cohort details");
      }

      const result = await response.json();
      setData(result.data || null);
    } catch (err: any) {
      console.error("Cohort details fetch error:", err);
      setError(err.message);
      toast.error("Failed to load cohort details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCohortDetails();
  }, [cohortId, authenticated]);

  return {
    data,
    loading,
    error,
    refetch: fetchCohortDetails,
  };
};
