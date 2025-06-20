import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import AdminLayout from "@/components/layouts/AdminLayout";
import TaskList from "@/components/admin/TaskList";
import { ArrowLeft, Calendar, Clock, Trophy } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";
import type { CohortMilestone, Cohort } from "@/lib/supabase/types";
import { useAdminAuth } from "@/hooks/useAdminAuth";

interface MilestoneWithCohort extends CohortMilestone {
  cohort: Cohort;
}

export default function MilestoneDetailsPage() {
  const { isAdmin, loading, authenticated } = useAdminAuth();
  const router = useRouter();
  const { id: cohortId, milestoneId } = router.query;

  const [milestone, setMilestone] = useState<MilestoneWithCohort | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || loading) return;

    if (!authenticated || !isAdmin) {
      router.push("/");
    }
  }, [authenticated, isAdmin, loading, router, isClient]);

  useEffect(() => {
    if (!authenticated || !isAdmin || !isClient || !milestoneId) return;

    fetchMilestone();
  }, [authenticated, isAdmin, isClient, milestoneId]);

  const fetchMilestone = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("cohort_milestones")
        .select(`
          *,
          cohort:cohort_id (
            id,
            name,
            bootcamp_program:bootcamp_program_id (
              id,
              name
            )
          )
        `)
        .eq("id", milestoneId)
        .single();

      if (error) throw error;

      if (!data) {
        throw new Error("Milestone not found");
      }

      setMilestone(data as MilestoneWithCohort);
    } catch (err: any) {
      console.error("Error fetching milestone:", err);
      setError(err.message || "Failed to load milestone");
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (loading || !isClient) {
    return (
      <AdminLayout>
        <div className="w-full flex justify-center items-center min-h-[400px]">
          <div className="w-12 h-12 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin"></div>
        </div>
      </AdminLayout>
    );
  }

  if (!authenticated || !isAdmin) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <div className="mb-6">
          <Link
            href={`/admin/cohorts/${cohortId}/milestones`}
            className="text-gray-400 hover:text-white flex items-center mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to cohort milestones
          </Link>

          {isLoading ? (
            <h1 className="text-2xl font-bold text-white">
              Loading milestone...
            </h1>
          ) : error ? (
            <h1 className="text-2xl font-bold text-white">
              Error Loading Milestone
            </h1>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-white">
                {milestone?.name}
              </h1>
              <p className="text-gray-400 mt-1">
                {milestone?.cohort?.name}
              </p>
            </>
          )}
        </div>

        {error && !isLoading && (
          <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {!isLoading && !error && milestone && (
          <div className="space-y-6">
            {/* Milestone Overview */}
            <Card className="bg-card border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Milestone Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-300 leading-relaxed">
                  {milestone.description}
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                    <Clock className="w-5 h-5 text-flame-yellow" />
                    <div>
                      <p className="text-sm text-gray-400">Duration</p>
                      <p className="text-white font-semibold">
                        {milestone.duration_hours || 0} hours
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                    <Trophy className="w-5 h-5 text-flame-yellow" />
                    <div>
                      <p className="text-sm text-gray-400">Total Reward</p>
                      <p className="text-white font-semibold">
                        {milestone.total_reward?.toLocaleString() || 0} DG
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                    <Calendar className="w-5 h-5 text-flame-yellow" />
                    <div>
                      <p className="text-sm text-gray-400">Start Date</p>
                      <p className="text-white font-semibold">
                        {milestone.start_date ? formatDate(milestone.start_date) : "Not set"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                    <Calendar className="w-5 h-5 text-flame-yellow" />
                    <div>
                      <p className="text-sm text-gray-400">End Date</p>
                      <p className="text-white font-semibold">
                        {milestone.end_date ? formatDate(milestone.end_date) : "Not set"}
                      </p>
                    </div>
                  </div>
                </div>

                {milestone.prerequisite_milestone_id && (
                  <div className="p-3 bg-blue-900/20 border border-blue-700 rounded-lg">
                    <p className="text-blue-300 text-sm">
                      <strong>Prerequisite:</strong> This milestone requires completion of a previous milestone.
                    </p>
                  </div>
                )}

                {milestone.lock_address && (
                  <div className="p-3 bg-purple-900/20 border border-purple-700 rounded-lg">
                    <p className="text-purple-300 text-sm">
                      <strong>Lock Address:</strong> {milestone.lock_address}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tasks Section */}
            <Card className="bg-card border-gray-800">
              <CardContent className="p-6">
                <TaskList 
                  milestoneId={milestone.id} 
                  milestoneName={milestone.name}
                />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}