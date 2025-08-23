import { useState, useEffect } from "react";
// useRouter is not directly used by the page anymore
import AdminListPageLayout from "@/components/admin/AdminListPageLayout"; // Import the new layout
import { Button } from "@/components/ui/button";
import { Pencil, Calendar, Trash2, Star } from "lucide-react"; // PlusCircle is in AdminListPageLayout, Eye not used
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import type { Cohort, BootcampProgram } from "@/lib/supabase/types";
// useLockManagerAdminAuth is now used by AdminListPageLayout
import { formatDate } from "@/lib/dateUtils"; // + Import shared function
import { Badge } from "@/components/ui/badge"; // Keep Badge for status display

export default function CohortListPage() {
  // Auth and client checks are handled by AdminListPageLayout
  const [cohorts, setCohorts] = useState<
    (Cohort & { bootcamp_program: BootcampProgram })[]
  >([]);
  const [isLoading, setIsLoading] = useState(true); // Page-specific loading for data
  const [error, setError] = useState<string | null>(null);
  console.log("Cohorts::", cohorts)
  // Fetch cohorts - This logic remains in the page
  useEffect(() => {
    // AdminListPageLayout handles auth check
    async function fetchCohorts() {
      try {
        setIsLoading(true);
        setError(null);
        const { data, error: dbError } = await supabase
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

        if (dbError) throw dbError;
        setCohorts(data || []);
      } catch (err: any) {
        console.error("Error fetching cohorts:", err);
        setError(err.message || "Failed to load cohorts");
      } finally {
        setIsLoading(false);
      }
    }

    fetchCohorts();
  }, []); // Runs once on component mount

  // formatDate is now imported

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
    <AdminListPageLayout
      title="Cohorts"
      newButtonText="New Cohort"
      newButtonLink="/admin/cohorts/new"
      isLoading={isLoading} // Pass the data loading state
      error={error}
      isEmpty={!isLoading && !error && cohorts.length === 0}
      emptyStateTitle="No cohorts found"
      emptyStateMessage="Create your first cohort to get started"
    >
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
                  <Link href={`/admin/cohorts/${cohort.id}/applications`} className="hover:text-flame-yellow">
                      {cohort.name}
                  </Link>
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
                    <Link href={`/admin/cohorts/${cohort.id}/program-details`}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-gray-700 hover:border-flame-yellow"
                        title="Program details"
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-gray-700 hover:border-red-500 hover:text-red-500"
                      title="Delete cohort"
                      // TODO: Implement delete functionality
                      onClick={() => alert("Delete functionality not yet implemented.")}
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
  );
}
