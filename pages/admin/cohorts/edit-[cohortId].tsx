import { useState, useEffect } from "react";
import { useRouter } from "next/router";
// AdminLayout is not directly used, it's part of AdminEditPageLayout
import AdminEditPageLayout from "@/components/admin/AdminEditPageLayout"; // Import the new layout
import CohortForm from "@/components/admin/CohortForm";
// ArrowLeft and Link from next/link are handled by AdminEditPageLayout
import { supabase } from "@/lib/supabase/client";
import type { Cohort } from "@/lib/supabase/types";
import { useLockManagerAdminAuth } from "@/hooks/useLockManagerAdminAuth"; // Use working blockchain auth

export default function EditCohortPage() {
  const { isAdmin, loading: authLoading, authenticated } = useLockManagerAdminAuth(); // Use working blockchain auth
  const router = useRouter();
  const { cohortId } = router.query;

  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Page-specific loading for data
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Protect admin route (this is page-level, AdminEditPageLayout uses AdminLayout which might also have protection)
  useEffect(() => {
    if (!isClient || authLoading) return;
    if (!isAdmin) {
      router.push("/");
    }
  }, [isAdmin, authLoading, router, isClient]);

  // Fetch cohort data
  useEffect(() => {
    if (!authenticated || !isAdmin || !isClient || !cohortId) {
      // If auth is still loading or conditions not met, don't fetch yet
      // If no cohortId, set loading to false if not already caught by auth checks
      if (!cohortId && isClient && isAdmin) {
          setIsLoading(false);
          setError("Cohort ID is missing.");
      }
      return;
    }

    async function fetchCohort() {
      try {
        setIsLoading(true);
        setError(null);
        const { data, error: dbError } = await supabase
          .from("cohorts")
          .select("*")
          .eq("id", cohortId)
          .single();

        if (dbError) throw dbError;

        if (!data) {
          throw new Error("Cohort not found");
        }

        setCohort(data);
      } catch (err: any) {
        console.error("Error fetching cohort:", err);
        setError(err.message || "Failed to load cohort");
      } finally {
        setIsLoading(false);
      }
    }

    fetchCohort();
  }, [authenticated, isAdmin, isClient, cohortId, authLoading]); // Added authLoading to dependencies

  // This initial loading state is for the auth check by useLockManagerAdminAuth
  if (authLoading || !isClient) {
    return (
      // Using AdminLayout directly for this top-level loading state before AdminEditPageLayout can render
      // This is because AdminEditPageLayout itself might be subject to the auth check.
      // Alternatively, AdminEditPageLayout could have its own comprehensive loading state for auth.
      // For now, this matches the original structure more closely for initial auth load.
      <AdminEditPageLayout
        title="Edit Cohort"
        backLinkHref="/admin/cohorts"
        backLinkText="Back to cohorts"
        isLoading={true} // Show layout's loader during auth
      >
        {/* Child is empty as main content is auth-blocked or loading */}
      </AdminEditPageLayout>
    );
  }

  // If redirecting, return null to avoid content flash
  if (!authenticated || !isAdmin) {
    return null;
  }

  return (
    <AdminEditPageLayout
      title="Edit Cohort"
      backLinkHref="/admin/cohorts"
      backLinkText="Back to cohorts"
      isLoading={isLoading} // This is for data loading, auth loading is handled above
      error={error}
    >
      {cohort ? (
        <CohortForm cohort={cohort} isEditing />
      ) : (
        !isLoading && !error && !cohort ?
          <div className="bg-amber-900/20 border border-amber-700 text-amber-300 px-4 py-3 rounded">
            Cohort not found. It may have been deleted or the ID is incorrect.
          </div>
        : null // Loading/Error is handled by AdminEditPageLayout based on props
      )}
    </AdminEditPageLayout>
  );
}
