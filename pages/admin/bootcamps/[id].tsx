import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { usePrivy } from "@privy-io/react-auth";
import AdminEditPageLayout from "@/components/admin/AdminEditPageLayout"; // Import the new layout
import BootcampForm from "@/components/admin/BootcampForm";
import { supabase } from "@/lib/supabase/client";
import type { BootcampProgram } from "@/lib/supabase/types";

export default function EditBootcampPage() {
  const { authenticated } = usePrivy(); // Keep Privy auth for now, can be reviewed if AdminEditPageLayout handles all auth
  const router = useRouter();
  const { id } = router.query;

  const [bootcamp, setBootcamp] = useState<BootcampProgram | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial auth check (basic, as AdminEditPageLayout doesn't have usePrivy, only useAdminAuth)
  // This can be refined if auth logic is centralized further.
  // For now, the page-level auth check is kept.
  // useAdminAuth could be added here if needed, or rely on AdminLayout's potential protection.
  useEffect(() => {
    if (!authenticated) {
      router.push("/"); // Redirect if not authenticated via Privy
    }
    // TODO: Add admin role check when role-based auth is implemented if not handled by a wrapper
  }, [authenticated, router]);

  // Fetch bootcamp data
  useEffect(() => {
    async function fetchBootcamp() {
      if (!id) return;

      try {
        setIsLoading(true);
        setError(null); // Reset error before fetch
        const { data, error: dbError } = await supabase
          .from("bootcamp_programs")
          .select("*")
          .eq("id", id)
          .single();

        if (dbError) throw dbError;

        if (!data) {
          throw new Error("Bootcamp not found");
        }

        setBootcamp(data);
      } catch (err: any) {
        console.error("Error fetching bootcamp:", err);
        setError(err.message || "Failed to load bootcamp");
      } finally {
        setIsLoading(false);
      }
    }

    if (authenticated && id) { // Proceed if authenticated and id is present
      fetchBootcamp();
    } else if (!id) {
      setIsLoading(false);
      // setError("Bootcamp ID is missing."); // Or handle as appropriate
    }
  }, [authenticated, id]);

  // If Privy auth is not yet determined, or not authenticated, can show a loader or message.
  // However, AdminEditPageLayout also has its own loader.
  // For this refactor, we assume Privy handles its loading/redirect before this page fully renders.

  return (
    <AdminEditPageLayout
      title="Edit Bootcamp"
      backLinkHref="/admin/bootcamps"
      backLinkText="Back to bootcamps"
      isLoading={isLoading}
      error={error}
    >
      {bootcamp ? (
        <BootcampForm bootcamp={bootcamp} isEditing />
      ) : (
        // This specific "Bootcamp not found" message can be shown if !isLoading && !error && !bootcamp
        // AdminEditPageLayout will show general error if `error` prop is set.
        // If no error, but no bootcamp, and not loading, it implies not found.
        !isLoading && !error && !bootcamp ?
          <div className="bg-amber-900/20 border border-amber-700 text-amber-300 px-4 py-3 rounded">
            Bootcamp not found. It may have been deleted or the ID is incorrect.
          </div>
        : null // Loading/Error is handled by AdminEditPageLayout
      )}
    </AdminEditPageLayout>
  );
}
