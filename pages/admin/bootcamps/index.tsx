import { useState, useEffect } from "react";
// useRouter is not directly used by the page anymore, AdminListPageLayout handles redirection if needed.
// import { useRouter } from "next/router";
import AdminListPageLayout from "@/components/admin/AdminListPageLayout"; // Import the new layout
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react"; // PlusCircle is in AdminListPageLayout
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import type { BootcampProgram } from "@/lib/supabase/types";
// useAdminAuth is now used by AdminListPageLayout, so it's not directly needed here.
// import { useAdminAuth } from "@/hooks/useAdminAuth";
import ConfirmationDialog from "@/components/ui/confirmation-dialog";
import { usePrivy } from "@privy-io/react-auth";

export default function BootcampListPage() {
  // const { isAdmin, loading, authenticated } = useAdminAuth(); // Handled by AdminListPageLayout
  // const router = useRouter(); // Handled by AdminListPageLayout
  const [bootcamps, setBootcamps] = useState<BootcampProgram[]>([]);
  const [isLoading, setIsLoading] = useState(true); // Page-specific loading for data
  const [error, setError] = useState<string | null>(null);
  // const [isClient, setIsClient] = useState(false); // Handled by AdminListPageLayout

  const { getAccessToken } = usePrivy();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bootcampToDelete, setBootcampToDelete] =
    useState<BootcampProgram | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // useEffect(() => { // Client check handled by AdminListPageLayout
  //   setIsClient(true);
  // }, []);

  // useEffect(() => { // Auth protection handled by AdminListPageLayout
  //   if (!isClient || loading) return;
  //   if (!authenticated || !isAdmin) {
  //     router.push("/");
  //   }
  // }, [authenticated, isAdmin, loading, router, isClient]);

  // Fetch bootcamps - This logic remains in the page
  useEffect(() => {
    // The AdminListPageLayout handles the auth check, so we assume if this effect runs,
    // the user is authenticated and is an admin.
    // However, an explicit check for isAdmin (if available from a hook here) could be an extra safety,
    // or rely on AdminListPageLayout to prevent rendering if not admin.
    // For now, fetchBootcamps is called without re-checking auth status here.

    async function fetchBootcamps() {
      try {
        setIsLoading(true);
        setError(null);
        const { data, error: dbError } = await supabase
          .from("bootcamp_programs")
          .select("*")
          .order("created_at", { ascending: false });

        if (dbError) throw dbError;
        setBootcamps(data || []);
      } catch (err: any) {
        console.error("Error fetching bootcamps:", err);
        setError(err.message || "Failed to load bootcamps");
      } finally {
        setIsLoading(false);
      }
    }

    fetchBootcamps();
  }, []); // Runs once on component mount after initial auth by layout

  // formatDate is now imported

  // The main loading state for auth is handled by AdminListPageLayout.
  // The page still needs to manage its own `isLoading` for the data fetch.

  async function handleConfirmDelete() {
    if (!bootcampToDelete) return;
    try {
      setIsDeleting(true);
      const token = await getAccessToken();
      const response = await fetch(
        `/api/admin/bootcamps/${bootcampToDelete.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Failed to delete bootcamp");
      }

      // Remove bootcamp locally
      setBootcamps((prev) => prev.filter((b) => b.id !== bootcampToDelete.id));
      setDeleteDialogOpen(false);
      setBootcampToDelete(null);
    } catch (err: any) {
      console.error("Delete error:", err);
      setError(err.message || "Failed to delete bootcamp");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <AdminListPageLayout
        title="Bootcamp Programs"
        newButtonText="New Bootcamp"
        newButtonLink="/admin/bootcamps/new"
        isLoading={isLoading} // Pass the data loading state
        error={error}
        isEmpty={!isLoading && !error && bootcamps.length === 0}
        emptyStateTitle="No bootcamps found"
        emptyStateMessage="Create your first bootcamp to get started"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                  Name
                </th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                  Duration
                </th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                  Max Reward
                </th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                  Price
                </th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                  Registration
                </th>
                <th className="py-3 px-4 text-right text-sm font-medium text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {bootcamps.map((bootcamp) => (
                <tr
                  key={bootcamp.id}
                  className="border-b border-gray-800 hover:bg-gray-900"
                >
                  <td className="py-4 px-4 text-sm text-white">
                    {bootcamp.name}
                  </td>
                  <td className="py-4 px-4 text-sm text-white">
                    {bootcamp.duration_weeks} weeks
                  </td>
                  <td className="py-4 px-4 text-sm text-white">
                    {bootcamp.max_reward_dgt.toLocaleString()} DGT
                  </td>
                  <td className="py-4 px-4 text-sm text-white">
                    Contact for pricing
                  </td>
                  <td className="py-4 px-4 text-sm text-white">
                    Open Registration
                  </td>
                  <td className="py-4 px-4 text-right">
                    <div className="flex justify-end space-x-2">
                      <Link href={`/admin/bootcamps/${bootcamp.id}`}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-gray-700 hover:border-flame-yellow"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-gray-700 hover:border-red-500 hover:text-red-500"
                        onClick={() => {
                          setBootcampToDelete(bootcamp);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminListPageLayout>
      <ConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Bootcamp"
        description="Are you sure you want to delete this bootcamp? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
        isLoading={isDeleting}
      />
    </>
  );
}
