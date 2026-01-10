import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import type { ProgramRequirement } from "@/lib/supabase/types";
import { getRecordId } from "@/lib/utils/id-generation";
import { useAdminApi } from "@/hooks/useAdminApi";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("admin:ProgramRequirementsForm");

interface RequirementForm {
  id: string;
  content: string;
  order_index: number;
}

interface ProgramRequirementsFormProps {
  cohortId: string;
  onSubmitSuccess?: () => void;
  onCancel?: () => void;
}

export default function ProgramRequirementsForm({
  cohortId,
  onSubmitSuccess,
  onCancel,
}: ProgramRequirementsFormProps) {
  const [requirements, setRequirements] = useState<RequirementForm[]>([
    { id: getRecordId(false), content: "", order_index: 0 },
  ]);
  const [, setExistingRequirements] = useState<ProgramRequirement[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { adminFetch } = useAdminApi({ suppressToasts: true });

  useEffect(() => {
    fetchExistingRequirements();
  }, [cohortId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchExistingRequirements = async () => {
    try {
      setIsLoading(true);
      const result = await adminFetch<{ data?: ProgramRequirement[] }>(
        `/api/admin/program-requirements?cohortId=${cohortId}`,
      );

      if (result.error) {
        throw new Error(result.error);
      }

      if (result.data?.data && result.data.data.length > 0) {
        setExistingRequirements(result.data.data);
        // Populate form with existing requirements
        const formRequirements = result.data.data.map(
          (requirement: ProgramRequirement) => ({
            id: requirement.id,
            content: requirement.content,
            order_index: requirement.order_index,
          }),
        );
        setRequirements(formRequirements);
      }
    } catch (err: any) {
      log.error("Error fetching requirements:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const addRequirement = () => {
    setRequirements((prev) => [
      ...prev,
      {
        id: getRecordId(false),
        content: "",
        order_index: prev.length,
      },
    ]);
  };

  const removeRequirement = (requirementId: string) => {
    setRequirements((prev) =>
      prev.filter((requirement) => requirement.id !== requirementId),
    );
  };

  const updateRequirement = (requirementId: string, content: string) => {
    setRequirements((prev) =>
      prev.map((requirement) =>
        requirement.id === requirementId
          ? { ...requirement, content }
          : requirement,
      ),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Filter out empty requirements
      const validRequirements = requirements.filter((requirement) =>
        requirement.content.trim(),
      );

      if (validRequirements.length === 0) {
        throw new Error("At least one requirement is required");
      }

      const now = new Date().toISOString();

      // Prepare requirements data
      const requirementsData = validRequirements.map((requirement, index) => ({
        id: requirement.id.startsWith("temp_")
          ? getRecordId(false)
          : requirement.id,
        cohort_id: cohortId,
        content: requirement.content.trim(),
        order_index: index,
        created_at: now,
        updated_at: now,
      }));

      const result = await adminFetch<{ success?: boolean; error?: string }>(
        "/api/admin/program-requirements",
        {
          method: "POST",
          body: JSON.stringify({ requirements: requirementsData, cohortId }),
        },
      );

      if (result.error) {
        throw new Error(result.error || "Failed to save requirements");
      }

      // Call success handler
      if (onSubmitSuccess) {
        onSubmitSuccess();
      }
    } catch (err: any) {
      log.error("Error saving requirements:", err);
      setError(err.message || "Failed to save requirements");
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "bg-transparent border-gray-700 text-gray-100 placeholder-gray-500 focus:border-flame-yellow/50";

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="w-8 h-8 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            Program Requirements
          </h3>
          <Button
            type="button"
            onClick={addRequirement}
            variant="outline"
            size="sm"
            className="border-flame-yellow text-flame-yellow hover:bg-flame-yellow/10"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Requirement
          </Button>
        </div>

        <div className="space-y-3">
          {requirements.map((requirement, index) => (
            <div
              key={requirement.id}
              className="flex items-center gap-3 p-3 bg-card border border-gray-800 rounded-lg"
            >
              <span className="bg-steel-red text-white rounded-full w-6 h-6 flex items-center justify-center font-bold text-sm flex-shrink-0">
                {index + 1}
              </span>
              <div className="flex-1">
                <Input
                  value={requirement.content}
                  onChange={(e) =>
                    updateRequirement(requirement.id, e.target.value)
                  }
                  placeholder="e.g., Basic understanding of blockchain concepts"
                  className={inputClass}
                />
              </div>
              {requirements.length > 1 && (
                <Button
                  type="button"
                  onClick={() => removeRequirement(requirement.id)}
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-300 hover:bg-red-900/20 flex-shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <p className="text-sm text-gray-400">
          Add prerequisites or requirements that participants should meet before
          joining this program.
        </p>
      </div>

      <div className="flex justify-end space-x-4 pt-4">
        <Button
          type="button"
          variant="outline"
          className="border-gray-700 text-white hover:bg-gray-800"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-steel-red hover:bg-steel-red/90 text-white"
        >
          {isSubmitting ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"></div>
              Saving...
            </>
          ) : (
            "Save Requirements"
          )}
        </Button>
      </div>
    </form>
  );
}
