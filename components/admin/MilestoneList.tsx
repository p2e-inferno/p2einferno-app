import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { CohortMilestone } from "@/lib/supabase/types";
import MilestoneForm from "./MilestoneForm";

interface MilestoneListProps {
  cohortId: string;
}

export default function MilestoneList({ cohortId }: MilestoneListProps) {
  const [milestones, setMilestones] = useState<CohortMilestone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingMilestone, setEditingMilestone] =
    useState<CohortMilestone | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Fetch milestones
  const fetchMilestones = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("cohort_milestones")
        .select("*")
        .eq("cohort_id", cohortId)
        .order("order_index");

      if (error) throw error;
      setMilestones(data || []);
    } catch (err: any) {
      console.error("Error fetching milestones:", err);
      setError(err.message || "Failed to load milestones");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMilestones();
  }, [cohortId]);

  // Update milestone order
  const updateMilestoneOrder = async (
    milestone: CohortMilestone,
    direction: "up" | "down"
  ) => {
    const currentIndex = milestones.findIndex((m) => m.id === milestone.id);
    if (
      (direction === "up" && currentIndex === 0) ||
      (direction === "down" && currentIndex === milestones.length - 1)
    ) {
      return; // Already at the edge, can't move further
    }

    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    const targetMilestone = milestones[newIndex];

    // Swap order indices
    const updatedMilestones = [...milestones];
    const currentOrderIndex = milestone.order_index;

    try {
      // Update the target milestone order
      await supabase
        .from("cohort_milestones")
        .update({ order_index: currentOrderIndex })
        .eq("id", targetMilestone.id);

      // Update the current milestone order
      await supabase
        .from("cohort_milestones")
        .update({ order_index: targetMilestone.order_index })
        .eq("id", milestone.id);

      // Refresh the milestone list
      fetchMilestones();
    } catch (err: any) {
      console.error("Error updating milestone order:", err);
      setError(err.message || "Failed to update milestone order");
    }
  };

  // Delete milestone
  const deleteMilestone = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this milestone?")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("cohort_milestones")
        .delete()
        .eq("id", id);

      if (error) throw error;

      // Refresh the milestone list
      fetchMilestones();
    } catch (err: any) {
      console.error("Error deleting milestone:", err);
      setError(err.message || "Failed to delete milestone");
    }
  };

  // Format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return "Not set";
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-flame-yellow"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {!editingMilestone && !isCreatingNew && (
            <div className="flex justify-end">
              <Button
                onClick={() => setIsCreatingNew(true)}
                className="bg-steel-red hover:bg-steel-red/90 text-white"
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Milestone
              </Button>
            </div>
          )}

          {isCreatingNew && !editingMilestone && (
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-medium text-white mb-4">
                Create New Milestone
              </h3>
              <MilestoneForm
                cohortId={cohortId}
                onSubmitSuccess={() => {
                  setIsCreatingNew(false);
                  fetchMilestones();
                }}
                onCancel={() => setIsCreatingNew(false)}
                existingMilestones={milestones}
              />
            </div>
          )}

          {editingMilestone && (
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-medium text-white mb-4">
                Edit Milestone
              </h3>
              <MilestoneForm
                cohortId={cohortId}
                milestone={editingMilestone}
                existingMilestones={milestones.filter(
                  (m) => m.id !== editingMilestone.id
                )}
                onSubmitSuccess={() => {
                  setEditingMilestone(null);
                  fetchMilestones();
                }}
                onCancel={() => setEditingMilestone(null)}
              />
            </div>
          )}

          {milestones.length === 0 && !isCreatingNew ? (
            <div className="bg-gray-900/30 border border-gray-800 rounded-lg p-8 text-center">
              <h3 className="text-lg font-medium text-white mb-2">
                No Milestones Yet
              </h3>
              <p className="text-gray-400 mb-6">
                Create milestones to track cohort progress through the program
              </p>
              <Button
                onClick={() => setIsCreatingNew(true)}
                className="bg-steel-red hover:bg-steel-red/90 text-white"
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Create First Milestone
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="py-3 px-4 text-left text-sm font-medium text-gray-400 w-10">
                      #
                    </th>
                    <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                      Name
                    </th>
                    <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                      Period
                    </th>
                    <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                      Prerequisites
                    </th>
                    <th className="py-3 px-4 text-right text-sm font-medium text-gray-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {milestones.map((milestone, index) => (
                    <tr
                      key={milestone.id}
                      className="border-b border-gray-800 hover:bg-gray-900"
                    >
                      <td className="py-4 px-4 text-sm text-gray-400">
                        {index + 1}
                      </td>
                      <td className="py-4 px-4 text-sm text-white">
                        <div>
                          <p className="font-medium">{milestone.name}</p>
                          <p className="text-gray-400 text-xs mt-1 max-w-xs truncate">
                            {milestone.description}
                          </p>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-sm text-white">
                        {milestone.start_date && milestone.end_date ? (
                          <span>
                            {formatDate(milestone.start_date)} -{" "}
                            {formatDate(milestone.end_date)}
                          </span>
                        ) : (
                          <span className="text-gray-500">Not scheduled</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-sm text-white">
                        {milestone.prerequisite_milestone_id ? (
                          milestones.find(
                            (m) => m.id === milestone.prerequisite_milestone_id
                          )?.name || "Unknown milestone"
                        ) : (
                          <span className="text-gray-500">None</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex justify-end space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-gray-700 hover:border-flame-yellow"
                            onClick={() => setEditingMilestone(milestone)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            className="border-gray-700 hover:border-cyan-500"
                            onClick={() =>
                              updateMilestoneOrder(milestone, "up")
                            }
                            disabled={index === 0}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            className="border-gray-700 hover:border-cyan-500"
                            onClick={() =>
                              updateMilestoneOrder(milestone, "down")
                            }
                            disabled={index === milestones.length - 1}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            className="border-gray-700 hover:border-red-500 hover:text-red-500"
                            onClick={() => deleteMilestone(milestone.id)}
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
      )}
    </div>
  );
}
