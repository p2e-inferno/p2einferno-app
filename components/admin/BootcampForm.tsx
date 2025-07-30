import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyBadge } from "@/components/ui/badge";

import ImageUpload from "@/components/ui/image-upload";
import type { BootcampProgram } from "@/lib/supabase/types";
import { useAdminApi } from "@/hooks/useAdminApi";
import { AuthError } from "@/components/ui/auth-error";

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

  const adminApi = useAdminApi({
    redirectOnAuthError: false,
    showAuthErrorModal: true,
  });

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

  const [formData, setFormData] = useState<Partial<BootcampProgram>>(
    bootcamp || {
      id: "",
      name: "",
      description: "",
      duration_weeks: 4,
      max_reward_dgt: 0,
      lock_address: "", // Using existing lock_address field from DB
      image_url: "",
    }
  );

  // Clear local error when adminApi error is cleared
  useEffect(() => {
    if (!adminApi.error) {
      setError(null);
    }
  }, [adminApi.error]);

  const handleAuthRefresh = () => {
    // Clear local error and trigger re-authentication
    setError(null);
    // User will need to refresh the page or re-login manually
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    let parsedValue: string | number = value;

    // Parse numeric values
    if (name === "duration_weeks" || name === "max_reward_dgt") {
      parsedValue = value === "" ? 0 : parseInt(value, 10);
    }

    setFormData((prev) => ({
      ...prev,
      [name]: parsedValue,
    }));
  };

  const handleImageChange = (imageUrl: string | null) => {
    setFormData((prev) => ({
      ...prev,
      image_url: imageUrl || "",
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Validate required fields
      if (!formData.name || !formData.description) {
        throw new Error("Please fill in all required fields");
      }

      if (formData.duration_weeks! < 1) {
        throw new Error("Duration must be at least 1 week");
      }

      // Prepare submission data for API
      const apiData: any = {
        id: isEditing ? originalBootcampId : formData.id,
        name: formData.name,
        description: formData.description,
        duration_weeks: formData.duration_weeks,
        max_reward_dgt: formData.max_reward_dgt,
        lock_address: formData.lock_address || null,
        image_url: formData.image_url || null,
        updated_at: new Date().toISOString(),
      };

      // Add created_at for new bootcamps
      if (!isEditing) {
        apiData.created_at = new Date().toISOString();
      }

      const endpoint = "/api/admin/bootcamps";
      const method = isEditing ? "PUT" : "POST";

      const response = await adminApi.adminFetch(endpoint, {
        method,
        body: JSON.stringify(apiData),
      });

      if (response.error) {
        throw new Error(response.error);
      }

      if (response.data) {
        // Success! Show success message or redirect
        if (!isEditing) {
          // Reset form after creating new bootcamp
          setFormData({
            id: "",
            name: "",
            description: "",
            duration_weeks: 4,
            max_reward_dgt: 0,
            lock_address: "",
            image_url: "",
          });
        }

        // Redirect back to bootcamp list
        router.push("/admin/bootcamps");
      }
    } catch (error: any) {
      console.error("Error saving bootcamp:", error);
      setError(error.message || "Failed to save bootcamp");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Common input styling for better visibility on dark backgrounds
  const inputClass =
    "bg-transparent border-gray-700 text-gray-100 placeholder-gray-500 focus:border-flame-yellow/50";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <AuthError
        error={error}
        onClear={() => setError(null)}
        className="mb-4"
      />

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

        <div className="space-y-2 md:col-span-2">
          <ImageUpload
            value={formData.image_url}
            onChange={handleImageChange}
            disabled={isSubmitting}
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
