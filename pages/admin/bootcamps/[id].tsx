import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import AdminEditPageLayout from "@/components/admin/AdminEditPageLayout";
import BootcampForm from "@/components/admin/BootcampForm";
import type { BootcampProgram } from "@/lib/supabase/types";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useLockManagerAdminAuth } from "@/hooks/useLockManagerAdminAuth";
import { useAdminFetchOnce } from "@/hooks/useAdminFetchOnce";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("admin:bootcamps:[id]");

export default function EditBootcampPage() {
  const {
    authenticated,
    isAdmin,
    loading: authLoading,
    user,
  } = useLockManagerAdminAuth();
  const router = useRouter();
  const { id } = router.query;
  const apiOptions = useMemo(() => ({ suppressToasts: true }), []);
  const { adminFetch } = useAdminApi(apiOptions);

  const [bootcamp, setBootcamp] = useState<BootcampProgram | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBootcamp = useCallback(async () => {
    if (!id) return;

    try {
      setIsLoading(true);
      setError(null);

      const result = await adminFetch<{
        success: boolean;
        data: BootcampProgram;
        error?: string;
      }>(`/api/admin/bootcamps/${id}`);

      if (result.error) {
        throw new Error(result.error);
      }

      if (!result.data?.success || !result.data.data) {
        throw new Error(result.data?.error || "Bootcamp not found");
      }

      setBootcamp(result.data.data);
    } catch (err: any) {
      log.error("Error fetching bootcamp:", err);
      setError(err.message || "Failed to load bootcamp");
    } finally {
      setIsLoading(false);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useAdminFetchOnce({
    authenticated,
    isAdmin,
    walletKey: user?.wallet?.address || null,
    keys: [id as string | undefined],
    fetcher: fetchBootcamp,
  });

  const [isRetrying, setIsRetrying] = useState(false);
  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await fetchBootcamp();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <AdminEditPageLayout
      title="Edit Bootcamp"
      backLinkHref="/admin/bootcamps"
      backLinkText="Back to bootcamps"
      isLoading={authLoading || isLoading}
      error={error}
      onRetry={handleRetry}
      isRetrying={isRetrying}
    >
      {
        bootcamp ? (
          <BootcampForm bootcamp={bootcamp} isEditing />
        ) : // This specific "Bootcamp not found" message can be shown if !isLoading && !error && !bootcamp
        // AdminEditPageLayout will show general error if `error` prop is set.
        // If no error, but no bootcamp, and not loading, it implies not found.
        !isLoading && !error && !bootcamp ? (
          <div className="bg-amber-900/20 border border-amber-700 text-amber-300 px-4 py-3 rounded">
            Bootcamp not found. It may have been deleted or the ID is incorrect.
          </div>
        ) : null // Loading/Error is handled by AdminEditPageLayout
      }
    </AdminEditPageLayout>
  );
}
