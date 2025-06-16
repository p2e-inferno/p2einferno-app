import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyBadge } from "@/components/ui/badge";
import { usePrivy } from "@privy-io/react-auth";
import type { BootcampProgram } from "@/lib/supabase/types";

interface BootcampFormProps {
  bootcamp?: BootcampProgram;
  isEditing?: boolean;
}

export default function BootcampForm({
  bootcamp,
  isEditing = false,
}: BootcampFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getAccessToken } = usePrivy();

  // Keep track of the original bootcamp ID for updates
  const [originalBootcampId, setOriginalBootcampId] = useState<string | null>(
    null
  );

  // Initialize form data and original ID
  useEffect(() => {
    if (bootcamp) {
      setFormData(bootcamp);
      setOriginalBootcampId(bootcamp.id);
      console.log("Initialized with bootcamp ID:", bootcamp.id);
    }
  }, [bootcamp]);

  const [formData, setFormData] = useState<
    Partial<
      BootcampProgram & {
        registration_start?: string;
        registration_end?: string;
      }
    >
  >(
    bootcamp || {
      id: "",
      name: "",
      description: "",
      duration_weeks: 4,
      max_reward_dgt: 0,
      cost_naira: 0,
      cost_usd: 0,
      registration_start: "",
      registration_end: "",
      lock_address: "", // Using existing lock_address field from DB
    }
  );

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    let parsedValue: string | number = value;

    // Parse numeric values
    if (
      name === "duration_weeks" ||
      name === "max_reward_dgt" ||
      name === "cost_naira" ||
      name === "cost_usd"
    ) {
      parsedValue = value === "" ? 0 : parseInt(value, 10);
    }

    setFormData((prev) => ({
      ...prev,
      [name]: parsedValue,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Validate required fields
      if (!formData.name || !formData.description || !formData.id) {
        throw new Error("Please fill in all required fields");
      }

      if (formData.duration_weeks! < 1) {
        throw new Error("Duration must be at least 1 week");
      }

      // Validate registration dates if provided
      if (formData.registration_start && formData.registration_end) {
        const startDate = new Date(formData.registration_start);
        const endDate = new Date(formData.registration_end);

        if (endDate <= startDate) {
          throw new Error("Registration end date must be after start date");
        }
      } else if (
        (formData.registration_start && !formData.registration_end) ||
        (!formData.registration_start && formData.registration_end)
      ) {
        throw new Error(
          "Both registration start and end dates must be provided or left empty"
        );
      }

      const now = new Date().toISOString();

      // Prepare submission data for API
      const submissionData = {
        ...formData,
        id: isEditing ? originalBootcampId : formData.id,
        name: formData.name,
        description: formData.description,
        duration_weeks: formData.duration_weeks,
        max_reward_dgt: formData.max_reward_dgt,
        cost_naira: formData.cost_naira,
        cost_usd: formData.cost_usd,
        registration_start: formData.registration_start || null,
        registration_end: formData.registration_end || null,
        lock_address: formData.lock_address || null,
        updated_at: now,
      } as any;

      // Include created_at when creating new bootcamp
      if (!isEditing) {
        submissionData.created_at = now;
      }

      // Get Privy access token for authorization header
      const token = await getAccessToken();
      if (!token) throw new Error("Authentication required");

      const apiUrl = "/api/admin/bootcamps";
      const method = isEditing ? "PUT" : "POST";

      console.log(`Submitting ${method} to ${apiUrl}`, submissionData);

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
        throw new Error(errorData?.error || "Failed to save bootcamp");
      }

      // Redirect back to bootcamp list
      router.push("/admin/bootcamps");
    } catch (err: any) {
      console.error("Error saving bootcamp:", err);
      setError(err.message || "Failed to save bootcamp");
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
        <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="id" className="text-white">
            ID (unique identifier, no spaces)
          </Label>
          {isEditing ? (
            <div className="mt-1">
              <CopyBadge
                value={formData.id || ""}
                variant="outline"
                className="text-gray-100 border-gray-600 bg-gray-900/50 hover:bg-gray-800 py-1.5 px-3"
              />
            </div>
          ) : (
            <Input
              id="id"
              name="id"
              value={formData.id}
              onChange={handleChange}
              placeholder="e.g., infernal-sparks"
              required
              className={inputClass}
            />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="name" className="text-white">
            Bootcamp Name
          </Label>
          <Input
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g., Infernal Sparks"
            required
            className={inputClass}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="description" className="text-white">
            Description
          </Label>
          <Textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={4}
            placeholder="Enter bootcamp description"
            required
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="duration_weeks" className="text-white">
            Duration (weeks)
          </Label>
          <Input
            id="duration_weeks"
            name="duration_weeks"
            type="number"
            value={formData.duration_weeks}
            onChange={handleChange}
            min={1}
            required
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="max_reward_dgt" className="text-white">
            Max Reward (DGT)
          </Label>
          <Input
            id="max_reward_dgt"
            name="max_reward_dgt"
            type="number"
            value={formData.max_reward_dgt}
            onChange={handleChange}
            min={0}
            required
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cost_naira" className="text-white">
            Cost in Naira (NGN)
          </Label>
          <Input
            id="cost_naira"
            name="cost_naira"
            type="number"
            value={formData.cost_naira}
            onChange={handleChange}
            min={0}
            required
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cost_usd" className="text-white">
            Cost in USD
          </Label>
          <Input
            id="cost_usd"
            name="cost_usd"
            type="number"
            value={formData.cost_usd}
            onChange={handleChange}
            min={0}
            required
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="registration_start" className="text-white">
            Registration Start Date
          </Label>
          <Input
            id="registration_start"
            name="registration_start"
            type="date"
            value={formData.registration_start || ""}
            onChange={handleChange}
            className={dateInputClass}
            onClick={(e) => e.currentTarget.showPicker()}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="registration_end" className="text-white">
            Registration End Date
          </Label>
          <Input
            id="registration_end"
            name="registration_end"
            type="date"
            value={formData.registration_end || ""}
            onChange={handleChange}
            className={dateInputClass}
            onClick={(e) => e.currentTarget.showPicker()}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="lock_address" className="text-white">
            Certificate Lock Address
          </Label>
          <Input
            id="lock_address"
            name="lock_address"
            value={formData.lock_address}
            onChange={handleChange}
            placeholder="e.g., 0x1234..."
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex justify-end space-x-4 pt-4">
        <Button
          type="button"
          variant="outline"
          className="border-gray-700 text-white hover:bg-gray-800"
          onClick={() => router.back()}
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
              {isEditing ? "Updating..." : "Creating..."}
            </>
          ) : (
            <>{isEditing ? "Update Bootcamp" : "Create Bootcamp"}</>
          )}
        </Button>
      </div>
    </form>
  );
}
