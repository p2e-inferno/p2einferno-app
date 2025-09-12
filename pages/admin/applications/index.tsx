import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { toast } from "react-hot-toast";
import AdminLayout from "@/components/layouts/AdminLayout";
import { useLockManagerAdminAuth } from "@/hooks/useLockManagerAdminAuth";
import AdminAccessRequired from "@/components/admin/AdminAccessRequired";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  CreditCard,
  Eye,
  Settings,
  UserCheck,
} from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { NetworkError } from "@/components/ui/network-error";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("admin:applications:index");

interface Application {
  id: string; // This is the user_application_status ID
  application_id: string; // This is the actual application ID
  user_profile_id: string;
  status: string; // user_application_status.status
  created_at: string;
  cohort_id: string;
  cohort_name?: string;
  user_name: string;
  user_email: string;
  experience_level: string;
  payment_status: string;
  application_status: string;
  bootcamp_enrollments?: Array<{
    id: string;
    enrollment_status: string;
    created_at: string;
  }>;
}

interface ApplicationStats {
  total: number;
  pending: number;
  completed: number;
  failed: number;
  inconsistent: number;
  missingEnrollments: number;
  missingPaymentRecords: number;
}

const AdminApplicationsPage: React.FC = () => {
  const {
    isAdmin,
    loading: authLoading,
    authenticated,
  } = useLockManagerAdminAuth();
  const { getAccessToken } = usePrivy();
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ApplicationStats | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedPaymentStatus, setSelectedPaymentStatus] =
    useState<string>("");
  const [reconcilingIds, setReconcilingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || authLoading) return;
    if (!authenticated || !isAdmin) {
      router.push("/");
    }
  }, [authenticated, isAdmin, authLoading, router, isClient]);

  const fetchApplications = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const accessToken = await getAccessToken();
      const params = new URLSearchParams();
      if (selectedStatus) params.append("status", selectedStatus);
      if (selectedPaymentStatus)
        params.append("payment_status", selectedPaymentStatus);

      const response = await fetch(
        `/api/admin/applications?${params.toString()}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch applications");
      }

      const data = await response.json();
      setApplications(data.applications || []);
      setStats(data.stats);
    } catch (err) {
      log.error("Error fetching applications:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch applications",
      );
    } finally {
      setIsLoading(false);
    }
  }, [selectedStatus, selectedPaymentStatus, getAccessToken]);

  useEffect(() => {
    if (authenticated && isAdmin && isClient) {
      fetchApplications();
    }
  }, [authenticated, isAdmin, isClient, fetchApplications]);

  const handleReconcile = async (applicationId: string, actions: string[]) => {
    try {
      log.info(
        "Reconciling application:",
        applicationId,
        "with actions:",
        actions,
      );
      if (!applicationId) {
        throw new Error("Application ID is required");
      }
      setReconcilingIds((prev) => new Set(prev).add(applicationId));

      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Authentication failed - please refresh the page");
      }

      const response = await fetch("/api/admin/applications/reconcile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ applicationId, actions }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Reconciliation failed");
      }

      if (result.success) {
        toast.success(
          `Application reconciled successfully! ${result.summary.successful}/${result.summary.total} actions completed.`,
        );
        await fetchApplications();
      } else {
        toast.error(result.message || "Reconciliation partially failed");
        log.info("Reconciliation results:", result.results);
      }
    } catch (err) {
      log.error("Reconciliation error:", err);
      toast.error(err instanceof Error ? err.message : "Reconciliation failed");
    } finally {
      setReconcilingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(applicationId);
        return newSet;
      });
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium";
    switch (status) {
      case "completed":
        return `${baseClasses} bg-green-900/30 text-green-300 border border-green-700`;
      case "pending":
        return `${baseClasses} bg-yellow-900/30 text-yellow-300 border border-yellow-700`;
      case "failed":
        return `${baseClasses} bg-red-900/30 text-red-300 border border-red-700`;
      default:
        return `${baseClasses} bg-gray-900/30 text-gray-300 border border-gray-700`;
    }
  };

  const getApplicationStatusBadge = (status: string) => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium";
    switch (status) {
      case "submitted":
        return `${baseClasses} bg-blue-900/30 text-blue-300 border border-blue-700`;
      case "under_review":
        return `${baseClasses} bg-purple-900/30 text-purple-300 border border-purple-700`;
      case "accepted":
        return `${baseClasses} bg-green-900/30 text-green-300 border border-green-700`;
      case "rejected":
        return `${baseClasses} bg-red-900/30 text-red-300 border border-red-700`;
      default:
        return `${baseClasses} bg-gray-900/30 text-gray-300 border border-gray-700`;
    }
  };

  const detectInconsistencies = (app: Application) => {
    const issues = [];
    const paymentStatus = app.payment_status;
    const hasEnrollment =
      app.bootcamp_enrollments && app.bootcamp_enrollments.length > 0;

    // For successful payments, status should be 'approved', not 'under_review' or 'pending'
    if (
      paymentStatus === "completed" &&
      (app.status === "under_review" || app.status === "pending")
    ) {
      issues.push("Needs approval");
    }

    // For approved applications with completed payments, check if enrollment is missing
    if (
      paymentStatus === "completed" &&
      app.status === "approved" &&
      !hasEnrollment
    ) {
      issues.push("Missing enrollment");
    }

    // Note: We're not checking for missing payment records here
    // because the data structure doesn't include payment transaction data
    // This should be handled by the backend reconcile service

    return issues;
  };

  const getSuggestedActions = (app: Application) => {
    const actions = [];
    const issues = detectInconsistencies(app);

    if (issues.includes("Needs approval")) {
      actions.push("approve_application");
    }

    if (issues.includes("Missing enrollment")) {
      actions.push("create_enrollment");
    }

    return actions;
  };

  // Show loading while auth is being checked
  if (authLoading || !isClient) {
    return (
      <AdminLayout>
        <div className="w-full flex justify-center items-center min-h-[400px]">
          <div className="w-12 h-12 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin"></div>
        </div>
      </AdminLayout>
    );
  }

  // Show access required if not authenticated or not admin
  if (!authenticated || !isAdmin) {
    return (
      <AdminAccessRequired message="You need admin access to view applications" />
    );
  }

  return (
    <AdminLayout>
      <div className="w-full">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-white">
                Applications Management
              </h1>
              <p className="text-gray-400 mt-1">
                Manage user applications and resolve data inconsistencies
              </p>
            </div>
            <Button
              onClick={fetchApplications}
              disabled={isLoading}
              className="bg-steel-red hover:bg-steel-red/90 text-white"
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>

          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
              <div className="bg-card border border-gray-800 rounded-lg p-4">
                <div className="flex items-center">
                  <Users className="h-5 w-5 text-blue-400 mr-2" />
                  <div>
                    <p className="text-xs text-gray-400">Total</p>
                    <p className="text-lg font-semibold text-white">
                      {stats.total}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-card border border-gray-800 rounded-lg p-4">
                <div className="flex items-center">
                  <Clock className="h-5 w-5 text-yellow-400 mr-2" />
                  <div>
                    <p className="text-xs text-gray-400">Pending</p>
                    <p className="text-lg font-semibold text-white">
                      {stats.pending}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-card border border-gray-800 rounded-lg p-4">
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
                  <div>
                    <p className="text-xs text-gray-400">Completed</p>
                    <p className="text-lg font-semibold text-white">
                      {stats.completed}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-card border border-gray-800 rounded-lg p-4">
                <div className="flex items-center">
                  <XCircle className="h-5 w-5 text-red-400 mr-2" />
                  <div>
                    <p className="text-xs text-gray-400">Failed</p>
                    <p className="text-lg font-semibold text-white">
                      {stats.failed}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-card border border-gray-800 rounded-lg p-4">
                <div className="flex items-center">
                  <AlertCircle className="h-5 w-5 text-orange-400 mr-2" />
                  <div>
                    <p className="text-xs text-gray-400">Inconsistent</p>
                    <p className="text-lg font-semibold text-white">
                      {stats.inconsistent}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-card border border-gray-800 rounded-lg p-4">
                <div className="flex items-center">
                  <UserCheck className="h-5 w-5 text-purple-400 mr-2" />
                  <div>
                    <p className="text-xs text-gray-400">Missing Enrollments</p>
                    <p className="text-lg font-semibold text-white">
                      {stats.missingEnrollments}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-card border border-gray-800 rounded-lg p-4">
                <div className="flex items-center">
                  <CreditCard className="h-5 w-5 text-cyan-400 mr-2" />
                  <div>
                    <p className="text-xs text-gray-400">Missing Payments</p>
                    <p className="text-lg font-semibold text-white">
                      {stats.missingPaymentRecords}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Payment Status
              </label>
              <select
                value={selectedPaymentStatus}
                onChange={(e) => setSelectedPaymentStatus(e.target.value)}
                className="bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2 text-sm"
              >
                <option value="">All Payment Status</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Application Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2 text-sm"
              >
                <option value="">All Application Status</option>
                <option value="submitted">Submitted</option>
                <option value="under_review">Under Review</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-flame-yellow"></div>
          </div>
        ) : error ? (
          <div className="mb-6">
            <NetworkError
              error={error}
              onRetry={fetchApplications}
              isRetrying={isLoading}
            />
          </div>
        ) : applications.length === 0 ? (
          <div className="bg-card border border-gray-800 rounded-lg p-12 text-center">
            <h3 className="text-lg font-semibold text-white mb-2">
              No applications found
            </h3>
            <p className="text-gray-400">
              No applications match the current filters.
            </p>
          </div>
        ) : (
          <div className="bg-card border border-gray-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-900/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Application
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Cohort
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Payment Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      App Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Issues
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {applications.map((application) => {
                    const issues = detectInconsistencies(application);
                    const suggestedActions = getSuggestedActions(application);

                    return (
                      <tr
                        key={application.application_id}
                        className="hover:bg-gray-900/30"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-mono text-gray-300">
                            {application.application_id.slice(0, 8)}...
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-300">
                            {application.user_name || "Unknown"}
                          </div>
                          <div className="text-xs text-gray-500">
                            {application.user_email}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-300">
                            {application.cohort_name ||
                              application.cohort_id ||
                              "Unknown"}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={getPaymentStatusBadge(
                              application.payment_status || "",
                            )}
                          >
                            {application.payment_status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={getApplicationStatusBadge(
                              application.application_status || "",
                            )}
                          >
                            {application.application_status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {issues.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {issues.map((issue, index) => (
                                <span
                                  key={index}
                                  className="px-2 py-1 bg-red-900/30 text-red-300 border border-red-700 rounded text-xs"
                                >
                                  {issue}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-green-400">✓ OK</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                          {new Date(
                            application.created_at,
                          ).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex space-x-2">
                            {suggestedActions.length > 0 && (
                              <Button
                                onClick={() =>
                                  handleReconcile(
                                    application.application_id,
                                    suggestedActions,
                                  )
                                }
                                disabled={reconcilingIds.has(
                                  application.application_id,
                                )}
                                size="sm"
                                className="bg-flame-yellow hover:bg-flame-yellow/90 text-black"
                              >
                                {reconcilingIds.has(
                                  application.application_id,
                                ) ? (
                                  <>
                                    <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                                    Reconciling...
                                  </>
                                ) : (
                                  <>
                                    <Settings className="w-3 h-3 mr-1" />
                                    Fix ({suggestedActions.length})
                                  </>
                                )}
                              </Button>
                            )}
                            <Button
                              onClick={() => {
                                toast("Application details view coming soon");
                              }}
                              size="sm"
                              variant="outline"
                              className="border-gray-600 text-gray-300 hover:bg-gray-800"
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              View
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminApplicationsPage;
