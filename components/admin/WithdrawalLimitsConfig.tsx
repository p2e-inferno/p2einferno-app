/**
 * WithdrawalLimitsConfig Component
 *
 * Admin UI for managing DG token withdrawal limits.
 * Allows viewing and updating min/max withdrawal amounts.
 * Displays audit history of changes.
 */

import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("components:admin:WithdrawalLimitsConfig");

interface Limits {
  minAmount: number;
  maxAmount: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface AuditLog {
  id: string;
  configKey: string;
  oldValue: any;
  newValue: any;
  changedBy: string;
  changedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export function WithdrawalLimitsConfig() {
  const [limits, setLimits] = useState<Limits | null>(null);
  const [editedLimits, setEditedLimits] = useState({
    minAmount: 0,
    maxAmount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [showAudit, setShowAudit] = useState(false);

  useEffect(() => {
    fetchLimits();
  }, []);

  const fetchLimits = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/admin/config/withdrawal-limits");
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch limits");
      }

      setLimits(data.limits);
      setEditedLimits({
        minAmount: data.limits.minAmount,
        maxAmount: data.limits.maxAmount,
      });
    } catch (err) {
      log.error("Failed to fetch limits", { error: err });
      setError(err instanceof Error ? err.message : "Failed to load limits");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const response = await fetch(
        "/api/admin/config/withdrawal-limits/audit?limit=10",
      );
      const data = await response.json();

      if (response.ok && data.success) {
        setAuditLogs(data.auditLogs || []);
      }
    } catch (err) {
      log.error("Failed to fetch audit logs", { error: err });
    }
  };

  useEffect(() => {
    if (showAudit && auditLogs.length === 0) {
      fetchAuditLogs();
    }
  }, [showAudit]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      const response = await fetch("/api/admin/config/withdrawal-limits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editedLimits),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update limits");
      }

      setLimits({
        ...data.limits,
        updatedAt: new Date().toISOString(),
        updatedBy: null,
      });
      setSuccess("Limits updated successfully!");

      // Refresh audit logs
      fetchAuditLogs();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      log.error("Failed to update limits", { error: err });
      setError(err instanceof Error ? err.message : "Failed to save limits");
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges =
    limits &&
    (editedLimits.minAmount !== limits.minAmount ||
      editedLimits.maxAmount !== limits.maxAmount);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900 mb-4">
        Withdrawal Limits Configuration
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-700">{success}</p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label
            htmlFor="minAmount"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Minimum Amount (DG)
          </label>
          <input
            type="number"
            id="minAmount"
            value={editedLimits.minAmount}
            onChange={(e) =>
              setEditedLimits({
                ...editedLimits,
                minAmount: parseInt(e.target.value) || 0,
              })
            }
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            min="1"
          />
          <p className="mt-1 text-xs text-gray-500">
            Users must withdraw at least this amount
          </p>
        </div>

        <div>
          <label
            htmlFor="maxAmount"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Maximum Daily Amount (DG)
          </label>
          <input
            type="number"
            id="maxAmount"
            value={editedLimits.maxAmount}
            onChange={(e) =>
              setEditedLimits({
                ...editedLimits,
                maxAmount: parseInt(e.target.value) || 0,
              })
            }
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            min="1"
          />
          <p className="mt-1 text-xs text-gray-500">
            Maximum amount that can be withdrawn in 24 hours (rolling window)
          </p>
        </div>

        {limits && limits.updatedAt && (
          <p className="text-xs text-gray-500">
            Last updated: {format(new Date(limits.updatedAt), "PPpp")}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* Audit History Section */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <button
          onClick={() => setShowAudit(!showAudit)}
          className="flex items-center text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <svg
            className={`w-5 h-5 mr-1 transition-transform ${showAudit ? "transform rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          Audit History
        </button>

        {showAudit && (
          <div className="mt-4">
            {auditLogs.length === 0 ? (
              <p className="text-sm text-gray-500">
                No audit history available
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Date
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Change
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Changed By
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                          {format(new Date(log.changedAt), "MMM d, HH:mm")}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-900">
                          {log.configKey === "dg_withdrawal_limits_batch" ? (
                            <div>
                              <div>Min: {log.newValue?.minAmount || "N/A"}</div>
                              <div>Max: {log.newValue?.maxAmount || "N/A"}</div>
                            </div>
                          ) : (
                            <div>
                              {log.oldValue && (
                                <span className="line-through text-gray-500">
                                  {log.oldValue}
                                </span>
                              )}
                              {" → "}
                              <span className="font-medium">
                                {log.newValue}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                          {log.changedBy.substring(0, 8)}...
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
    </div>
  );
}
