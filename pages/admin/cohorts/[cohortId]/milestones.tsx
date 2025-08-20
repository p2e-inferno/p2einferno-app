import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import AdminLayout from "@/components/layouts/AdminLayout";
import MilestoneList from "@/components/admin/MilestoneList";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import type { Cohort } from "@/lib/supabase/types";
import { useLockManagerAdminAuth } from "@/hooks/useLockManagerAdminAuth";

interface CohortWithProgram extends Cohort {
  bootcamp_program?: {
    id: string;
    name: string;
  };
}

export default function CohortMilestonesPage() {
  const { isAdmin, loading, authenticated } = useLockManagerAdminAuth();
  const router = useRouter();
  const { cohortId } = router.query;

  const [cohort, setCohort] = useState<CohortWithProgram | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  // Make sure we're on the client side before redirecting
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Protect admin route
  useEffect(() => {
    // Only run this effect on client-side and after auth check is complete
    if (!isClient || loading) return;

    // Redirect if not authenticated or not an admin
    if (!authenticated || !isAdmin) {
      router.push("/");
    }
  }, [authenticated, isAdmin, loading, router, isClient]);

  // Fetch cohort data
  useEffect(() => {
    if (!authenticated || !isAdmin || !isClient || !cohortId) return;

    async function fetchCohort() {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from("cohorts")
          .select(
            `
            *,
            bootcamp_program:bootcamp_program_id (
              id,
              name
            )
          `
          )
          .eq("id", cohortId)
          .single();

        if (error) throw error;

        if (!data) {
          throw new Error("Cohort not found");
        }

        setCohort(data as CohortWithProgram);
      } catch (err: any) {
        console.error("Error fetching cohort:", err);
        setError(err.message || "Failed to load cohort");
      } finally {
        setIsLoading(false);
      }
    }

    fetchCohort();
  }, [authenticated, isAdmin, isClient, cohortId]);

  // Show loading state while checking authentication
  if (loading || !isClient) {
    return (
      <AdminLayout>
        <div className="w-full flex justify-center items-center min-h-[400px]">
          <div className="w-12 h-12 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin"></div>
        </div>
      </AdminLayout>
    );
  }

  // Only render admin content if authenticated and is admin
  if (!authenticated || !isAdmin) {
    return null; // This avoids momentary flash of content before redirect
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <div className="mb-6">
          <Link
            href="/admin/cohorts"
            className="text-gray-400 hover:text-white flex items-center mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to cohorts
          </Link>

          {isLoading ? (
            <h1 className="text-2xl font-bold text-white">
              Loading cohort data...
            </h1>
          ) : error ? (
            <h1 className="text-2xl font-bold text-white">
              Error Loading Cohort
            </h1>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-white">
                Milestones: {cohort?.name}
              </h1>
              <p className="text-gray-400 mt-1">
                Manage cohort milestones for{" "}
                {cohort?.bootcamp_program?.name || "Unknown Bootcamp"}
              </p>
            </>
          )}
        </div>

        {error && !isLoading && (
          <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {!isLoading && !error && cohort && (
          <div className="bg-card border border-gray-800 rounded-lg p-6">
            <MilestoneList cohortId={cohort.id} />
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
