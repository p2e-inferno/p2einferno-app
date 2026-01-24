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
import { useAdminApi } from "@/hooks/useAdminApi";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";
import { isEASEnabled } from "@/lib/attestation/core/config";
import { useGaslessAttestation } from "@/hooks/attestation/useGaslessAttestation";

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
  changedByWallet?: string | null;
  changedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  attestationUid?: string | null;
  attestationScanUrl?: string | null;
}

export function WithdrawalLimitsConfig() {
  const { adminFetch } = useAdminApi({ suppressToasts: true });
  const selectedWallet = useSmartWalletSelection() as any;
  const { signAttestation, isSigning } = useGaslessAttestation();
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
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      setTimeout(() => setCopiedValue(null), 1500);
    } catch (err) {
      log.warn("Failed to copy value", { error: err });
    }
  };

  useEffect(() => {
    fetchLimits();
  }, []);

  const fetchLimits = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await adminFetch<{
        success: boolean;
        limits: Limits;
        error?: string;
      }>("/api/admin/config/withdrawal-limits");

      if (result.error || !result.data?.success) {
        throw new Error(
          result.error || result.data?.error || "Failed to fetch limits",
        );
      }

      setLimits(result.data.limits);
      setEditedLimits({
        minAmount: result.data.limits.minAmount,
        maxAmount: result.data.limits.maxAmount,
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
      const result = await adminFetch<{
        success: boolean;
        auditLogs?: AuditLog[];
      }>("/api/admin/config/withdrawal-limits/audit?limit=10");

      if (!result.error && result.data?.success) {
        setAuditLogs(result.data.auditLogs || []);
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

      let attestationSignature: any = null;
      if (isEASEnabled()) {
        if (!selectedWallet?.address) {
          throw new Error("Wallet not connected");
        }
        if (!limits) {
          throw new Error("Current limits not loaded");
        }

        const adminAddress = selectedWallet.address;
        const changeTimestamp = BigInt(Math.floor(Date.now() / 1000));
        const changeReason = "DG withdrawal limits updated";

        attestationSignature = await signAttestation({
          schemaKey: "dg_config_change",
          recipient: adminAddress,
          schemaData: [
            { name: "adminAddress", type: "address", value: adminAddress },
            {
              name: "previousMinAmount",
              type: "uint256",
              value: BigInt(limits.minAmount),
            },
            {
              name: "newMinAmount",
              type: "uint256",
              value: BigInt(editedLimits.minAmount),
            },
            {
              name: "previousMaxDaily",
              type: "uint256",
              value: BigInt(limits.maxAmount),
            },
            {
              name: "newMaxDaily",
              type: "uint256",
              value: BigInt(editedLimits.maxAmount),
            },
            {
              name: "changeTimestamp",
              type: "uint256",
              value: changeTimestamp,
            },
            { name: "changeReason", type: "string", value: changeReason },
          ],
        });
      }

      const result = await adminFetch<{
        success: boolean;
        limits: Limits;
        error?: string;
      }>("/api/admin/config/withdrawal-limits", {
        method: "PUT",
        body: JSON.stringify({ ...editedLimits, attestationSignature }),
      });

      if (result.error || !result.data?.success) {
        throw new Error(
          result.error || result.data?.error || "Failed to update limits",
        );
      }

      setLimits({
        ...result.data.limits,
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
          disabled={isSaving || isSigning || !hasChanges}
          className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-black bg-flame-yellow hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-flame-yellow disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving || isSigning ? "Saving..." : "Save Changes"}
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
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">
                        Attestation
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
                              <div>
                                Min:{" "}
                                <span className="line-through text-gray-400">
                                  {log.oldValue?.minAmount ?? "—"}
                                </span>{" "}
                                →{" "}
                                <span className="font-medium">
                                  {log.newValue?.minAmount ?? "—"}
                                </span>
                              </div>
                              <div>
                                Max:{" "}
                                <span className="line-through text-gray-400">
                                  {log.oldValue?.maxAmount ?? "—"}
                                </span>{" "}
                                →{" "}
                                <span className="font-medium">
                                  {log.newValue?.maxAmount ?? "—"}
                                </span>
                              </div>
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
                          {log.changedByWallet ? (
                            <div className="flex items-center gap-2">
                              <span className="font-mono">
                                {log.changedByWallet.substring(0, 6)}...
                                {log.changedByWallet.substring(
                                  log.changedByWallet.length - 4,
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  copyToClipboard(log.changedByWallet!)
                                }
                                className="text-xs text-flame-yellow hover:underline"
                              >
                                {copiedValue === log.changedByWallet
                                  ? "Copied"
                                  : "Copy"}
                              </button>
                            </div>
                          ) : (
                            <span className="font-mono">
                              {log.changedBy.substring(0, 8)}...
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-white">
                          {log.attestationScanUrl ? (
                            <a
                              href={log.attestationScanUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block text-flame-yellow hover:underline"
                            >
                              View on EAS Scan
                            </a>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
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
