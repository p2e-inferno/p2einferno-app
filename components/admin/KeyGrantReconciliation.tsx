import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "react-hot-toast";
import { useAdminApi } from "@/hooks/useAdminApi";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  User,
  Wallet,
} from "lucide-react";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("admin:KeyGrantReconciliation");

interface FailedGrant {
  id: string;
  userProfileId: string;
  userInfo: {
    walletAddress: string;
    email?: string;
    displayName?: string;
    privyUserId: string;
  };
  failureDetails: {
    cohortId: string;
    lockAddress: string;
    error: string;
    attempts: number;
    requiresReconciliation?: boolean;
  };
  failedAt: string;
}

interface ReconciliationFilters {
  since?: string;
  until?: string;
  userProfileId?: string;
  cohortId?: string;
  limit?: number;
}

export default function KeyGrantReconciliation() {
  const { adminFetch } = useAdminApi({ suppressToasts: true });
  const [failedGrants, setFailedGrants] = useState<FailedGrant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryingGrantId, setRetryingGrantId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReconciliationFilters>({
    limit: 20,
  });

  const loadFailedGrants = async () => {
    setIsLoading(true);
    try {
      const result = await adminFetch<{
        success?: boolean;
        data?: { failedGrants?: FailedGrant[] };
        error?: string;
      }>("/api/admin/reconcile-key-grants", {
        method: "POST",
        body: JSON.stringify({
          operation: "list_failed_grants",
          filters,
        }),
      });

      if (result.error) {
        throw new Error(result.error || "Failed to load failed grants");
      }

      setFailedGrants(result.data?.data?.failedGrants || []);
    } catch (error: any) {
      log.error("Error loading failed grants:", error);
      toast.error(error.message || "Failed to load failed grants");
    } finally {
      setIsLoading(false);
    }
  };

  const retryAllFailedGrants = async () => {
    setIsRetrying(true);
    try {
      toast.loading("Retrying failed key grants...", { id: "bulk-retry" });

      const result = await adminFetch<{
        success?: boolean;
        data?: { attempted: number; successful: number; failed: number };
        error?: string;
      }>("/api/admin/reconcile-key-grants", {
        method: "POST",
        body: JSON.stringify({
          operation: "retry_failed_grants",
          filters,
        }),
      });

      if (result.error || !result.data?.data) {
        throw new Error(result.error || "Failed to retry grants");
      }

      const { attempted, successful, failed } = result.data.data;

      toast.success(
        `Retry completed: ${successful} successful, ${failed} failed out of ${attempted} attempts`,
        { id: "bulk-retry", duration: 5000 },
      );

      // Reload the list to reflect changes
      await loadFailedGrants();
    } catch (error: any) {
      log.error("Error retrying failed grants:", error);
      toast.error(error.message || "Failed to retry grants", {
        id: "bulk-retry",
      });
    } finally {
      setIsRetrying(false);
    }
  };

  const retrySingleGrant = async (grant: FailedGrant) => {
    setRetryingGrantId(grant.id);
    try {
      toast.loading("Retrying key grant...", { id: `retry-${grant.id}` });

      const result = await adminFetch<{
        success?: boolean;
        alreadyHasKey?: boolean;
        error?: string;
      }>("/api/admin/reconcile-key-grants", {
        method: "POST",
        body: JSON.stringify({
          operation: "retry_single_grant",
          userProfileId: grant.userProfileId,
          cohortId: grant.failureDetails.cohortId,
          lockAddress: grant.failureDetails.lockAddress,
          walletAddress: grant.userInfo.walletAddress,
        }),
      });

      if (result.error) {
        throw new Error(result.error || "Failed to retry grant");
      }

      if (result.data?.success) {
        if (result.data.alreadyHasKey) {
          toast.success("User already has a valid key", {
            id: `retry-${grant.id}`,
          });
        } else {
          toast.success("Key granted successfully!", {
            id: `retry-${grant.id}`,
          });
        }
        // Reload the list to reflect changes
        await loadFailedGrants();
      } else {
        toast.error(`Key grant failed: ${result.data?.error}`, {
          id: `retry-${grant.id}`,
        });
      }
    } catch (error: any) {
      log.error("Error retrying single grant:", error);
      toast.error(error.message || "Failed to retry grant", {
        id: `retry-${grant.id}`,
      });
    } finally {
      setRetryingGrantId(null);
    }
  };

  useEffect(() => {
    loadFailedGrants();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">
          Key Grant Reconciliation
        </h2>
        <div className="flex space-x-2">
          <Button
            onClick={loadFailedGrants}
            disabled={isLoading}
            variant="outline"
            className="border-gray-700 text-gray-300 hover:bg-gray-800"
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            onClick={retryAllFailedGrants}
            disabled={isRetrying || failedGrants.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${isRetrying ? "animate-spin" : ""}`}
            />
            Retry All
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 bg-gray-900/50 border-gray-800">
        <h3 className="text-lg font-semibold text-white mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="since" className="text-white">
              Since Date
            </Label>
            <Input
              id="since"
              type="datetime-local"
              value={filters.since || ""}
              onChange={(e) =>
                setFilters({ ...filters, since: e.target.value })
              }
              className="bg-transparent border-gray-700 text-gray-100"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cohortId" className="text-white">
              Cohort ID
            </Label>
            <Input
              id="cohortId"
              value={filters.cohortId || ""}
              onChange={(e) =>
                setFilters({ ...filters, cohortId: e.target.value })
              }
              placeholder="e.g., cohort-2024-q1"
              className="bg-transparent border-gray-700 text-gray-100"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="limit" className="text-white">
              Limit
            </Label>
            <Input
              id="limit"
              type="number"
              value={filters.limit || ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  limit: parseInt(e.target.value) || 20,
                })
              }
              min={1}
              max={100}
              className="bg-transparent border-gray-700 text-gray-100"
            />
          </div>
        </div>
        <div className="mt-4">
          <Button
            onClick={loadFailedGrants}
            variant="outline"
            size="sm"
            className="border-gray-700 text-gray-300 hover:bg-gray-800"
          >
            Apply Filters
          </Button>
        </div>
      </Card>

      {/* Results */}
      <div className="space-y-4">
        {isLoading ? (
          <Card className="p-8 text-center bg-gray-900/50 border-gray-800">
            <div className="w-8 h-8 border-2 border-gray-400 border-t-blue-400 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading failed grants...</p>
          </Card>
        ) : failedGrants.length === 0 ? (
          <Card className="p-8 text-center bg-gray-900/50 border-gray-800">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">No failed key grants found</p>
            <p className="text-gray-500 text-sm mt-2">
              All key grants are working properly!
            </p>
          </Card>
        ) : (
          <>
            <div className="flex items-center space-x-2 text-gray-400">
              <AlertTriangle className="w-5 h-5 text-orange-400" />
              <span>{failedGrants.length} failed key grant(s) found</span>
            </div>

            {failedGrants.map((grant) => (
              <Card
                key={grant.id}
                className="p-4 bg-gray-900/50 border-gray-800"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-3">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="text-white font-medium">
                        {grant.userInfo.displayName ||
                          grant.userInfo.email ||
                          "Unknown User"}
                      </span>
                      <span className="text-gray-400 text-sm">
                        ({grant.userInfo.privyUserId.substring(0, 8)}...)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="flex items-center space-x-2 mb-2">
                          <Wallet className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-300">Wallet:</span>
                        </div>
                        <code className="text-xs text-blue-400 bg-gray-800 px-2 py-1 rounded">
                          {grant.userInfo.walletAddress}
                        </code>
                      </div>

                      <div>
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-gray-300">Cohort:</span>
                        </div>
                        <code className="text-xs text-green-400 bg-gray-800 px-2 py-1 rounded">
                          {grant.failureDetails.cohortId}
                        </code>
                      </div>

                      <div className="md:col-span-2">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-gray-300">Lock Address:</span>
                        </div>
                        <code className="text-xs text-purple-400 bg-gray-800 px-2 py-1 rounded break-all">
                          {grant.failureDetails.lockAddress}
                        </code>
                      </div>

                      <div>
                        <div className="flex items-center space-x-2 mb-2">
                          <AlertTriangle className="w-4 h-4 text-red-400" />
                          <span className="text-gray-300">Error:</span>
                        </div>
                        <p className="text-xs text-red-400 bg-gray-800 px-2 py-1 rounded">
                          {grant.failureDetails.error}
                        </p>
                      </div>

                      <div>
                        <div className="flex items-center space-x-2 mb-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-300">Failed At:</span>
                        </div>
                        <p className="text-xs text-gray-400">
                          {formatDate(grant.failedAt)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="ml-4">
                    <Button
                      onClick={() => retrySingleGrant(grant)}
                      disabled={retryingGrantId === grant.id}
                      size="sm"
                      className="bg-orange-600 hover:bg-orange-700 text-white"
                    >
                      {retryingGrantId === grant.id ? (
                        <>
                          <div className="w-3 h-3 border border-white/20 border-t-white rounded-full animate-spin mr-2" />
                          Retrying...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3 h-3 mr-2" />
                          Retry
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-700">
                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                    <span>Attempts: {grant.failureDetails.attempts}</span>
                    <span>
                      Profile ID: {grant.userProfileId.substring(0, 8)}...
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </>
        )}
      </div>

      {/* Summary Stats */}
      {failedGrants.length > 0 && (
        <Card className="p-4 bg-gray-900/50 border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-3">Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div className="bg-red-900/20 border border-red-700 rounded p-3">
              <div className="text-2xl font-bold text-red-400">
                {failedGrants.length}
              </div>
              <div className="text-sm text-red-300">Failed Grants</div>
            </div>
            <div className="bg-blue-900/20 border border-blue-700 rounded p-3">
              <div className="text-2xl font-bold text-blue-400">
                {new Set(failedGrants.map((g) => g.userProfileId)).size}
              </div>
              <div className="text-sm text-blue-300">Affected Users</div>
            </div>
            <div className="bg-purple-900/20 border border-purple-700 rounded p-3">
              <div className="text-2xl font-bold text-purple-400">
                {
                  new Set(failedGrants.map((g) => g.failureDetails.cohortId))
                    .size
                }
              </div>
              <div className="text-sm text-purple-300">Affected Cohorts</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
