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
  const [auditLoaded, setAuditLoaded] = useState(false);

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
        setAuditLoaded(true);
      }
    } catch (err) {
      log.error("Failed to fetch audit logs", { error: err });
    }
  };

  useEffect(() => {
    if (showAudit && !auditLoaded) {
      fetchAuditLogs();
    }
  }, [showAudit, auditLoaded]);

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
      setAuditLoaded(false); // Reset to allow refetch

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
    <div className="bg-gray-800 shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-white mb-4">
        Withdrawal Limits Configuration
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-md">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-900/50 border border-green-700 rounded-md">
          <p className="text-sm text-green-300">{success}</p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label
            htmlFor="minAmount"
            className="block text-sm font-medium text-gray-300 mb-1"
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
            className="w-full border border-gray-600 bg-gray-700 text-white rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-flame-yellow focus:border-flame-yellow"
            min="1"
          />
          <p className="mt-1 text-xs text-gray-400">
            Users must withdraw at least this amount
          </p>
        </div>

        <div>
          <label
            htmlFor="maxAmount"
            className="block text-sm font-medium text-gray-300 mb-1"
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
            className="w-full border border-gray-600 bg-gray-700 text-white rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-flame-yellow focus:border-flame-yellow"
            min="1"
          />
          <p className="mt-1 text-xs text-gray-400">
            Maximum amount that can be withdrawn in 24 hours (rolling window)
          </p>
        </div>

        {limits && limits.updatedAt && (
          <p className="text-xs text-gray-400">
            Last updated: {format(new Date(limits.updatedAt), "PPpp")}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-black bg-flame-yellow hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-flame-yellow disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* Audit History Section */}
      <div className="mt-6 pt-6 border-t border-gray-600">
        <button
          onClick={() => setShowAudit(!showAudit)}
          className="flex items-center text-sm font-medium text-gray-300 hover:text-white"
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
              <p className="text-sm text-gray-400">
                No audit history available
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-600">
                  <thead className="bg-gray-700">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">
                        Date
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">
                        Change
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">
                        Changed By
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-800 divide-y divide-gray-600">
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-white">
                          {format(new Date(log.changedAt), "MMM d, HH:mm")}
                        </td>
                        <td className="px-4 py-2 text-sm text-white">
                          {log.configKey === "dg_withdrawal_limits_batch" ? (
                            <div>
                              <div>Min: {log.newValue?.minAmount || "N/A"}</div>
                              <div>Max: {log.newValue?.maxAmount || "N/A"}</div>
                            </div>
                          ) : (
                            <div>
                              {log.oldValue && (
                                <span className="line-through text-gray-400">
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
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-400">
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
