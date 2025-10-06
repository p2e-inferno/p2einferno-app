import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CohortMilestone } from "@/lib/supabase/types";
import { nanoid } from "nanoid";
import { usePrivy } from "@privy-io/react-auth";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("admin:MilestoneForm");

interface MilestoneFormProps {
  cohortId: string;
  milestone?: CohortMilestone;
  existingMilestones?: CohortMilestone[];
  onSubmitSuccess?: () => void;
  onCancel?: () => void;
}

export default function MilestoneForm({
  cohortId,
  milestone,
  existingMilestones = [],
  onSubmitSuccess,
  onCancel,
}: MilestoneFormProps) {
  const isEditing = !!milestone;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getAccessToken } = usePrivy();

  const [formData, setFormData] = useState<Partial<CohortMilestone>>(
    milestone || {
      id: nanoid(10),
      cohort_id: cohortId,
      name: "",
      description: "",
      order_index:
        existingMilestones.length > 0
          ? Math.max(...existingMilestones.map((m) => m.order_index)) + 10
          : 0,
      start_date: "",
      end_date: "",
      lock_address: "",
      prerequisite_milestone_id: "",
    },
  );

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Validate required fields
      if (!formData.name || !formData.description) {
        throw new Error("Name and description are required");
      }

      // If both dates are provided, validate them
      if (formData.start_date && formData.end_date) {
        const startDate = new Date(formData.start_date);
        const endDate = new Date(formData.end_date);

        if (endDate <= startDate) {
          throw new Error("End date must be after start date");
        }
      }

      const now = new Date().toISOString();

      // Prepare data for submission, ensuring no null values
      const submissionData = {
        ...formData,
        name: formData.name || "",
        description: formData.description || "",
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        lock_address: formData.lock_address || "",
        prerequisite_milestone_id: formData.prerequisite_milestone_id || null,
        updated_at: now,
      };

      // Get Privy access token for authorization header
      const token = await getAccessToken();
      if (!token) throw new Error("Authentication required");

      const apiUrl = "/api/admin/milestones";
      const method = isEditing ? "PUT" : "POST";

      // Include created_at when creating new milestone
      if (!isEditing) {
        (submissionData as any).created_at = now;
      }

      const response = await fetch(apiUrl, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(submissionData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Failed to save milestone");
      }

      // Call success handler
      if (onSubmitSuccess) {
        onSubmitSuccess();
      }
    } catch (err: any) {
      log.error("Error saving milestone:", err);
      setError(err.message || "Failed to save milestone");
      setIsSubmitting(false);
    }
  };

  // Common input styling for better visibility on dark backgrounds
  const inputClass =
    "bg-transparent border-gray-700 text-gray-100 placeholder-gray-500 focus:border-flame-yellow/50";

  // Special styling for date inputs to make the calendar icon visible
  const dateInputClass = `${inputClass} [color-scheme:dark] cursor-pointer`;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-white">
            Milestone Name *
          </Label>
          <Input
            id="name"
            name="name"
            value={formData.name || ""}
            onChange={handleChange}
            placeholder="e.g., Week 1: Introduction"
            required
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="prerequisite_milestone_id" className="text-white">
            Prerequisite Milestone
          </Label>
          <select
            id="prerequisite_milestone_id"
            name="prerequisite_milestone_id"
            value={formData.prerequisite_milestone_id || ""}
            onChange={handleChange}
            className={`${inputClass} w-full h-10 rounded-md px-3`}
          >
            <option value="">None (First milestone)</option>
            {existingMilestones
              .sort((a, b) => a.order_index - b.order_index)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="description" className="text-white">
            Description *
          </Label>
          <Textarea
            id="description"
            name="description"
            value={formData.description || ""}
            onChange={handleChange}
            rows={3}
            placeholder="Enter milestone description"
            required
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="start_date" className="text-white">
            Start Date
          </Label>
          <Input
            id="start_date"
            name="start_date"
            type="date"
            value={formData.start_date || ""}
            onChange={handleChange}
            className={dateInputClass}
            onClick={(e) => e.currentTarget.showPicker()}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="end_date" className="text-white">
            End Date
          </Label>
          <Input
            id="end_date"
            name="end_date"
            type="date"
            value={formData.end_date || ""}
            onChange={handleChange}
            className={dateInputClass}
            onClick={(e) => e.currentTarget.showPicker()}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="lock_address" className="text-white">
            Lock Address
          </Label>
          <Input
            id="lock_address"
            name="lock_address"
            value={formData.lock_address || ""}
            onChange={handleChange}
            placeholder="e.g., 0x1234..."
            className={inputClass}
          />
          <p className="text-sm text-gray-400 mt-1">
            Optional: Unlock Protocol lock address for milestone NFT badges
          </p>
        </div>
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
              {isEditing ? "Updating..." : "Create Milestone"}
            </>
          ) : (
            <>{isEditing ? "Update Milestone" : "Create Milestone"}</>
          )}
        </Button>
      </div>
    </form>
  );
}
