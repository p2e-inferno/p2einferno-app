import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import type { ProgramHighlight } from "@/lib/supabase/types";
import { nanoid } from "nanoid";
import { usePrivy } from "@privy-io/react-auth";

interface HighlightForm {
  id: string;
  content: string;
  order_index: number;
}

interface ProgramHighlightsFormProps {
  cohortId: string;
  onSubmitSuccess?: () => void;
  onCancel?: () => void;
}

export default function ProgramHighlightsForm({
  cohortId,
  onSubmitSuccess,
  onCancel,
}: ProgramHighlightsFormProps) {
  const [highlights, setHighlights] = useState<HighlightForm[]>([
    { id: nanoid(10), content: "", order_index: 0 },
  ]);
  const [, setExistingHighlights] = useState<ProgramHighlight[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getAccessToken } = usePrivy();

  useEffect(() => {
    fetchExistingHighlights();
  }, [cohortId]);

  const fetchExistingHighlights = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/admin/program-highlights?cohortId=${cohortId}`);
      
      if (response.ok) {
        const result = await response.json();
        if (result.data && result.data.length > 0) {
          setExistingHighlights(result.data);
          // Populate form with existing highlights
          const formHighlights = result.data.map((highlight: ProgramHighlight) => ({
            id: highlight.id,
            content: highlight.content,
            order_index: highlight.order_index,
          }));
          setHighlights(formHighlights);
        }
      }
    } catch (err: any) {
      console.error("Error fetching highlights:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const addHighlight = () => {
    setHighlights((prev) => [
      ...prev,
      {
        id: nanoid(10),
        content: "",
        order_index: prev.length,
      },
    ]);
  };

  const removeHighlight = (highlightId: string) => {
    setHighlights((prev) => prev.filter((highlight) => highlight.id !== highlightId));
  };

  const updateHighlight = (highlightId: string, content: string) => {
    setHighlights((prev) =>
      prev.map((highlight) =>
        highlight.id === highlightId ? { ...highlight, content } : highlight
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Filter out empty highlights
      const validHighlights = highlights.filter((highlight) => highlight.content.trim());

      if (validHighlights.length === 0) {
        throw new Error("At least one highlight is required");
      }

      // Get Privy access token for authorization header
      const token = await getAccessToken();
      if (!token) throw new Error("Authentication required");

      const now = new Date().toISOString();

      // Prepare highlights data
      const highlightsData = validHighlights.map((highlight, index) => ({
        id: highlight.id.startsWith("temp_") ? nanoid(10) : highlight.id,
        cohort_id: cohortId,
        content: highlight.content.trim(),
        order_index: index,
        created_at: now,
        updated_at: now,
      }));

      const response = await fetch("/api/admin/program-highlights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ highlights: highlightsData, cohortId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Failed to save highlights");
      }

      // Call success handler
      if (onSubmitSuccess) {
        onSubmitSuccess();
      }
    } catch (err: any) {
      console.error("Error saving highlights:", err);
      setError(err.message || "Failed to save highlights");
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
          <h3 className="text-lg font-semibold text-white">Program Highlights</h3>
          <Button
            type="button"
            onClick={addHighlight}
            variant="outline"
            size="sm"
            className="border-flame-yellow text-flame-yellow hover:bg-flame-yellow/10"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Highlight
          </Button>
        </div>

        <div className="space-y-3">
          {highlights.map((highlight, index) => (
            <div
              key={highlight.id}
              className="flex items-center gap-3 p-3 bg-card border border-gray-800 rounded-lg"
            >
              <span className="bg-steel-red text-white rounded-full w-6 h-6 flex items-center justify-center font-bold text-sm flex-shrink-0">
                {index + 1}
              </span>
              <div className="flex-1">
                <Input
                  value={highlight.content}
                  onChange={(e) => updateHighlight(highlight.id, e.target.value)}
                  placeholder="e.g., Hands-on blockchain development experience"
                  className={inputClass}
                />
              </div>
              {highlights.length > 1 && (
                <Button
                  type="button"
                  onClick={() => removeHighlight(highlight.id)}
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
          Add key highlights or benefits that participants will gain from this program.
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
            "Save Highlights"
          )}
        </Button>
      </div>
    </form>
  );
}