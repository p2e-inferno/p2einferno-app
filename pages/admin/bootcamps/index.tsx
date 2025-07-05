import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import AdminListPageLayout from "@/components/admin/AdminListPageLayout";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import type { BootcampProgram } from "@/lib/supabase/types";
import ConfirmationDialog from "@/components/ui/confirmation-dialog";
import { usePrivy } from "@privy-io/react-auth";
import { withAdminAuth } from "@/components/admin/withAdminAuth";

function BootcampsPage() {
  const router = useRouter();
  const [bootcamps, setBootcamps] = useState<BootcampProgram[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getAccessToken } = usePrivy();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bootcampToDelete, setBootcampToDelete] =
    useState<BootcampProgram | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
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
  }, []);

  async function handleConfirmDelete() {
    if (!bootcampToDelete) return;

    try {
      setIsDeleting(true);
      const accessToken = await getAccessToken();

      // Call API to delete the bootcamp
      const response = await fetch(
        `/api/admin/bootcamps/${bootcampToDelete.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete bootcamp");
      }

      // Remove from UI
      setBootcamps((prev) =>
        prev.filter((bootcamp) => bootcamp.id !== bootcampToDelete.id)
      );
    } catch (err: any) {
      console.error("Error deleting bootcamp:", err);
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setBootcampToDelete(null);
    }
  }

  return (
    <>
      <AdminListPageLayout
        title="Bootcamp Programs"
        newButtonText="New Bootcamp"
        newButtonLink="/admin/bootcamps/new"
        isLoading={isLoading}
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
                    {bootcamp.max_reward_dgt?.toLocaleString() || 0} DGT
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
        description={`Are you sure you want to delete ${bootcampToDelete?.name}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isLoading={isDeleting}
      />
    </>
  );
}

// Export the page wrapped in admin authentication
export default withAdminAuth(
  BootcampsPage,
  "You need admin access to manage bootcamps"
);
