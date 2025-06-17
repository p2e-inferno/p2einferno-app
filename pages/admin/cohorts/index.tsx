import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import AdminLayout from "@/components/layouts/AdminLayout";
import { Button } from "@/components/ui/button";
import { PlusCircle, Pencil, Eye, Trash2, Calendar } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import type { Cohort, BootcampProgram } from "@/lib/supabase/types";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Badge } from "@/components/ui/badge";

export default function CohortListPage() {
  const { isAdmin, loading, authenticated } = useAdminAuth();
  const router = useRouter();
  const [cohorts, setCohorts] = useState<
    (Cohort & { bootcamp_program: BootcampProgram })[]
  >([]);
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

  // Fetch cohorts
  useEffect(() => {
    if (!authenticated || !isAdmin || !isClient) return;

    async function fetchCohorts() {
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
          .order("created_at", { ascending: false });

        if (error) throw error;
        setCohorts(data || []);
      } catch (err: any) {
        console.error("Error fetching cohorts:", err);
        setError(err.message || "Failed to load cohorts");
      } finally {
        setIsLoading(false);
      }
    }

    fetchCohorts();
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

  // Function to format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Function to get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge className="bg-green-600">Open</Badge>;
      case "closed":
        return <Badge className="bg-red-600">Closed</Badge>;
      case "upcoming":
        return <Badge className="bg-flame-yellow text-black">Upcoming</Badge>;
      default:
        return <Badge className="bg-gray-600">{status}</Badge>;
    }
  };

  return (
    <AdminLayout>
      <div className="w-full">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Cohorts</h1>
          <Link href="/admin/cohorts/new">
            <Button className="bg-steel-red hover:bg-steel-red/90 text-white">
              <PlusCircle className="mr-2 h-4 w-4" />
              New Cohort
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
        ) : cohorts.length === 0 ? (
          <div className="bg-card border border-gray-800 rounded-lg p-12 text-center">
            <h3 className="text-lg font-semibold text-white mb-2">
              No cohorts found
            </h3>
            <p className="text-gray-400 mb-6">
              Create your first cohort to get started
            </p>
            <Link href="/admin/cohorts/new">
              <Button className="bg-steel-red hover:bg-steel-red/90 text-white">
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Cohort
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
                    Bootcamp
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                    Duration
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                    Participants
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                    Status
                  </th>
                  <th className="py-3 px-4 text-right text-sm font-medium text-gray-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((cohort) => (
                  <tr
                    key={cohort.id}
                    className="border-b border-gray-800 hover:bg-gray-900"
                  >
                    <td className="py-4 px-4 text-sm text-white">
                      {cohort.name}
                    </td>
                    <td className="py-4 px-4 text-sm text-white">
                      {cohort.bootcamp_program?.name || "Unknown Bootcamp"}
                    </td>
                    <td className="py-4 px-4 text-sm text-white">
                      {formatDate(cohort.start_date)} -{" "}
                      {formatDate(cohort.end_date)}
                    </td>
                    <td className="py-4 px-4 text-sm text-white">
                      {cohort.current_participants} / {cohort.max_participants}
                    </td>
                    <td className="py-4 px-4 text-sm text-white">
                      {getStatusBadge(cohort.status)}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex justify-end space-x-2">
                        {/* Edit cohort button */}
                        <Link href={`/admin/cohorts/${cohort.id}`}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-gray-700 hover:border-flame-yellow"
                            title="Edit cohort"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Link>

                        {/* Milestones button */}
                        <Link href={`/admin/cohorts/${cohort.id}/milestones`}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-gray-700 hover:border-cyan-500"
                            title="Manage milestones"
                          >
                            <Calendar className="h-4 w-4" />
                          </Button>
                        </Link>

                        {/* Delete button would be implemented with confirmation dialog */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-gray-700 hover:border-red-500 hover:text-red-500"
                          title="Delete cohort"
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
