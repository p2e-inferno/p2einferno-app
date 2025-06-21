import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyBadge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase/client";
import { usePrivy } from "@privy-io/react-auth";
import type { Cohort, BootcampProgram } from "@/lib/supabase/types";
import { nanoid } from "nanoid";

interface CohortFormProps {
  cohort?: Cohort;
  isEditing?: boolean;
}

export default function CohortForm({
  cohort,
  isEditing = false,
}: CohortFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootcampPrograms, setBootcampPrograms] = useState<BootcampProgram[]>(
    []
  );
  const [isLoadingPrograms, setIsLoadingPrograms] = useState(false);
  const { getAccessToken } = usePrivy();
  const [keyManagersInput, setKeyManagersInput] = useState<string>(
    cohort?.key_managers?.join(", ") || ""
  );

  const [formData, setFormData] = useState<Partial<Cohort>>(
    cohort || {
      id: nanoid(10),
      name: "",
      bootcamp_program_id: "",
      start_date: "",
      end_date: "",
      max_participants: 100,
      current_participants: 0,
      registration_deadline: "",
      status: "upcoming",
      lock_address: "",
      key_managers: [],
      usdt_amount: 0,
      naira_amount: 0,
    }
  );

  // Fetch bootcamp programs
  useEffect(() => {
    async function fetchBootcampPrograms() {
      try {
        setIsLoadingPrograms(true);
        const { data, error } = await supabase
          .from("bootcamp_programs")
          .select("*")
          .order("name");

        if (error) throw error;
        setBootcampPrograms(data || []);
      } catch (err: any) {
        console.error("Error fetching bootcamp programs:", err);
        setError(err.message || "Failed to load bootcamp programs");
      } finally {
        setIsLoadingPrograms(false);
      }
    }

    fetchBootcampPrograms();
  }, []);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    let parsedValue: string | number = value;

    // Parse numeric values
    if (
      name === "max_participants" ||
      name === "current_participants" ||
      name === "usdt_amount" ||
      name === "naira_amount"
    ) {
      parsedValue = value === "" ? 0 : parseFloat(value);
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
      if (
        !formData.name ||
        !formData.bootcamp_program_id ||
        !formData.start_date ||
        !formData.end_date ||
        !formData.registration_deadline
      ) {
        throw new Error("Please fill in all required fields");
      }

      // Validate dates
      const startDate = new Date(formData.start_date);
      const endDate = new Date(formData.end_date);

      if (endDate <= startDate) {
        throw new Error("End date must be after start date");
      }

      const now = new Date().toISOString();

      // Process key managers from comma-separated string to array
      const keyManagers = keyManagersInput
        .split(",")
        .map((addr) => addr.trim())
        .filter((addr) => addr.length > 0);

      const dataToSave = {
        ...formData,
        key_managers: keyManagers,
      };

      const apiUrl = "/api/admin/cohorts";
      const method = isEditing ? "PUT" : "POST";

      const token = await getAccessToken();
      if (!token) throw new Error("Authentication required");

      const response = await fetch(apiUrl, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          isEditing
            ? { ...dataToSave, id: cohort!.id }
            : { ...dataToSave, created_at: now, updated_at: now }
        ),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to save cohort");
      }

      // Redirect back to cohort list
      router.push("/admin/cohorts");
    } catch (err: any) {
      console.error("Error saving cohort:", err);
      setError(err.message || "Failed to save cohort");
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
            Cohort ID (unique identifier)
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
              placeholder="e.g., cohort-2024-q1"
              required
              className={inputClass}
            />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="name" className="text-white">
            Cohort Name
          </Label>
          <Input
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g., Winter 2024 Cohort"
            required
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bootcamp_program_id" className="text-white">
            Bootcamp Program
          </Label>
          <select
            id="bootcamp_program_id"
            name="bootcamp_program_id"
            value={formData.bootcamp_program_id}
            onChange={handleChange}
            required
            disabled={isEditing}
            className={`${inputClass} w-full h-10 rounded-md px-3`}
          >
            <option value="" disabled>
              {isLoadingPrograms
                ? "Loading bootcamps..."
                : "Select a bootcamp program"}
            </option>
            {bootcampPrograms.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
              </option>
            ))}
          </select>
          {isEditing && (
            <p className="text-sm text-gray-400 mt-1">
              Bootcamp program cannot be changed after creation.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="status" className="text-white">
            Status
          </Label>
          <select
            id="status"
            name="status"
            value={formData.status}
            onChange={handleChange}
            required
            className={`${inputClass} w-full h-10 rounded-md px-3`}
          >
            <option value="upcoming">Upcoming</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="start_date" className="text-white">
            Start Date
          </Label>
          <Input
            id="start_date"
            name="start_date"
            type="date"
            value={formData.start_date}
            onChange={handleChange}
            required
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
            value={formData.end_date}
            onChange={handleChange}
            required
            className={dateInputClass}
            onClick={(e) => e.currentTarget.showPicker()}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="registration_deadline" className="text-white">
            Registration Deadline
          </Label>
          <Input
            id="registration_deadline"
            name="registration_deadline"
            type="date"
            value={formData.registration_deadline}
            onChange={handleChange}
            required
            className={dateInputClass}
            onClick={(e) => e.currentTarget.showPicker()}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="max_participants" className="text-white">
            Maximum Participants
          </Label>
          <Input
            id="max_participants"
            name="max_participants"
            type="number"
            value={formData.max_participants}
            onChange={handleChange}
            min={1}
            required
            className={inputClass}
          />
        </div>

        {isEditing && (
          <div className="space-y-2">
            <Label htmlFor="current_participants" className="text-white">
              Current Participants
            </Label>
            <Input
              id="current_participants"
              name="current_participants"
              type="number"
              value={formData.current_participants}
              onChange={handleChange}
              min={0}
              required
              className={inputClass}
            />
          </div>
        )}

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="lock_address" className="text-white">
            Lock Address
          </Label>
          <Input
            id="lock_address"
            name="lock_address"
            value={formData.lock_address}
            onChange={handleChange}
            placeholder="e.g., 0x1234..."
            className={inputClass}
          />
          <p className="text-sm text-gray-400 mt-1">
            Optional: Unlock Protocol lock address for cohort access NFTs
          </p>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="key_managers" className="text-white">
            Key Managers Wallets
          </Label>
          <Input
            id="key_managers"
            name="key_managers"
            value={keyManagersInput}
            onChange={(e) => setKeyManagersInput(e.target.value)}
            placeholder="e.g., 0xabc..., 0xdef..., 0x123..."
            className={inputClass}
          />
          <p className="text-sm text-gray-400 mt-1">
            Optional: Comma-separated list of wallet addresses for key managers
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="usdt_amount" className="text-white">
            USDT Amount
          </Label>
          <Input
            id="usdt_amount"
            name="usdt_amount"
            type="number"
            step="0.01"
            value={formData.usdt_amount}
            onChange={handleChange}
            min={0}
            placeholder="0.00"
            className={inputClass}
          />
          <p className="text-sm text-gray-400 mt-1">
            Optional: Cohort price in USDT
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="naira_amount" className="text-white">
            Naira Amount
          </Label>
          <Input
            id="naira_amount"
            name="naira_amount"
            type="number"
            step="0.01"
            value={formData.naira_amount}
            onChange={handleChange}
            min={0}
            placeholder="0.00"
            className={inputClass}
          />
          <p className="text-sm text-gray-400 mt-1">
            Optional: Cohort price in Naira
          </p>
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
            <>{isEditing ? "Update Cohort" : "Create Cohort"}</>
          )}
        </Button>
      </div>
    </form>
  );
}
