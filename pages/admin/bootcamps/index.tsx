import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import AdminLayout from "@/components/layouts/AdminLayout";
import { Button } from "@/components/ui/button";
import { PlusCircle, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import type { BootcampProgram } from "@/lib/supabase/types";
import { formatCurrency } from "@/lib/bootcamp-data";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export default function BootcampListPage() {
  const { isAdmin, loading, authenticated } = useAdminAuth();
  const router = useRouter();
  const [bootcamps, setBootcamps] = useState<BootcampProgram[]>([]);
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

  // Fetch bootcamps
  useEffect(() => {
    if (!authenticated || !isAdmin || !isClient) return;

    async function fetchBootcamps() {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from("bootcamp_programs")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setBootcamps(data || []);
      } catch (err: any) {
        console.error("Error fetching bootcamps:", err);
        setError(err.message || "Failed to load bootcamps");
      } finally {
        setIsLoading(false);
      }
    }

    fetchBootcamps();
  }, [authenticated, isAdmin, isClient]);

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
      <div className="w-full">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Bootcamp Programs</h1>
          <Link href="/admin/bootcamps/new">
            <Button className="bg-steel-red hover:bg-steel-red/90 text-white">
              <PlusCircle className="mr-2 h-4 w-4" />
              New Bootcamp
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-flame-yellow"></div>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded">
            {error}
          </div>
        ) : bootcamps.length === 0 ? (
          <div className="bg-card border border-gray-800 rounded-lg p-12 text-center">
            <h3 className="text-lg font-semibold text-white mb-2">
              No bootcamps found
            </h3>
            <p className="text-gray-400 mb-6">
              Create your first bootcamp to get started
            </p>
            <Link href="/admin/bootcamps/new">
              <Button className="bg-steel-red hover:bg-steel-red/90 text-white">
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Bootcamp
              </Button>
            </Link>
          </div>
        ) : (
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
                      {formatCurrency(bootcamp.cost_usd, "USD")} /{" "}
                      {formatCurrency(bootcamp.cost_naira, "NGN")}
                    </td>
                    <td className="py-4 px-4 text-sm text-white">
                      {bootcamp.registration_start && bootcamp.registration_end
                        ? `${new Date(
                            bootcamp.registration_start
                          ).toLocaleDateString()} - ${new Date(
                            bootcamp.registration_end
                          ).toLocaleDateString()}`
                        : "Not set"}
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
                        {/* Delete button would be implemented with a confirmation dialog */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-gray-700 hover:border-red-500 hover:text-red-500"
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
        )}
      </div>
    </AdminLayout>
  );
}
