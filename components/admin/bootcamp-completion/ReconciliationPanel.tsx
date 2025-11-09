import { useState } from "react";
import { useAdminApi } from "@/hooks/useAdminApi";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

interface ReconciliationPanelProps {
  cohortId: string;
}

export function ReconciliationPanel({ cohortId }: ReconciliationPanelProps) {
  const { adminFetch } = useAdminApi();
  const [isFixing, setIsFixing] = useState(false);
  const [results, setResults] = useState<any>(null);

  const fixStuckStatuses = async () => {
    setIsFixing(true);
    try {
      const response = await adminFetch(
        `/api/admin/cohorts/${cohortId}/fix-statuses`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (response.error) throw new Error(response.error);
      setResults(response.data);
      toast.success(`Fixed ${response.data?.fixed?.length || 0} enrollments`);
    } catch (error) {
      toast.error("Failed to fix statuses");
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="p-4 border rounded-md">
      <h3 className="text-lg font-semibold mb-4">Completion Reconciliation</h3>
      <Button onClick={fixStuckStatuses} disabled={isFixing}>
        {isFixing ? "Fixing..." : "Fix Stuck Completion Statuses"}
      </Button>
      {results && (
        <div className="mt-4">
          <p className="text-green-600">Fixed: {results.fixed?.length || 0}</p>
          <p className="text-yellow-600">
            Skipped: {results.skipped?.length || 0}
          </p>
        </div>
      )}
    </div>
  );
}
