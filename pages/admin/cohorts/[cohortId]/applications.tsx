import React, { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import { toast } from "react-hot-toast";
import { NetworkError } from "@/components/ui/network-error";
import { useAdminApi } from "@/hooks/useAdminApi";
import {
  Users,
  CreditCard,
  CheckCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  Settings,
} from "lucide-react";
import AdminLayout from "../../../../components/layouts/AdminLayout";
import { useLockManagerAdminAuth } from "@/hooks/useLockManagerAdminAuth";
import { useAdminFetchOnce } from "@/hooks/useAdminFetchOnce";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("admin:cohorts:[cohortId]:applications");

interface CohortApplication {
  id: string;
  user_name: string;
  user_email: string;
  experience_level: string;
  motivation: string;
  payment_status: string;
  application_status: string;
  user_application_status: string;
  enrollment_status?: string;
  created_at: string;
  updated_at: string;
  amount_paid?: number;
  currency?: string;
  needs_reconciliation: boolean;
}

interface CohortDetails {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  max_participants: number;
  current_participants: number;
  registration_deadline: string;
  status: string;
  bootcamp_program: {
    name: string;
    description: string;
  };
}

interface CohortStats {
  total_applications: number;
  pending_payment: number;
  payment_completed: number;
  enrolled: number;
  revenue: number;
  needs_reconciliation: number;
}

export default function CohortDetailPage() {
  const {
    authenticated,
    isAdmin,
    loading: authLoading,
    user,
  } = useLockManagerAdminAuth();
  const router = useRouter();
  const { cohortId } = router.query;
  // Memoize options to prevent adminFetch from being recreated every render
  const adminApiOptions = useMemo(() => ({ suppressToasts: true }), []);
  const { adminFetch } = useAdminApi(adminApiOptions);

  const [cohort, setCohort] = useState<CohortDetails | null>(null);
  const [applications, setApplications] = useState<CohortApplication[]>([]);
  const [stats, setStats] = useState<CohortStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);

  // Removed local adminFetch in favor of shared useAdminApi for consistency

  const fetchCohortData = useCallback(async () => {
    if (!cohortId || typeof cohortId !== "string") return;

    try {
      setLoading(true);
      setError(null);

      // Fetch cohort details and applications in parallel using unified auth
      const [cohortRes, applicationsRes] = await Promise.all([
        adminFetch(`/api/admin/cohorts/${cohortId}`),
        adminFetch(`/api/admin/cohorts/${cohortId}/applications`),
      ]);

      setCohort(cohortRes.data);
      setApplications(applicationsRes.data?.applications || []);
      setStats(applicationsRes.data?.stats);
    } catch (err: any) {
      log.error("Error fetching cohort data:", err);
      setError(err?.message || "Failed to load cohort data");
    } finally {
      setLoading(false);
    }
  }, [cohortId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCohortData();
    setRefreshing(false);
    toast.success("Data refreshed");
  }, [fetchCohortData]);

  const handleReconcileApplication = useCallback(
    async (applicationId: string) => {
      try {
        await adminFetch("/api/admin/applications/reconcile", {
          method: "POST",
          body: JSON.stringify({ applicationId }),
        });

        toast.success("Application reconciled successfully");
        await fetchCohortData(); // Refresh data
      } catch (error) {
        log.error("Reconciliation error:", error);
        toast.error("Failed to reconcile application");
      }
    },
    [fetchCohortData], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleBulkReconcile = useCallback(async () => {
    const applicationsNeedingReconciliation = applications.filter(
      (app) => app.needs_reconciliation,
    );

    if (applicationsNeedingReconciliation.length === 0) {
      toast("No applications need reconciliation");
      return;
    }

    try {
      const promises = applicationsNeedingReconciliation.map((app) =>
        adminFetch("/api/admin/applications/reconcile", {
          method: "POST",
          body: JSON.stringify({ applicationId: app.id }),
        }),
      );

      await Promise.all(promises);
      toast.success(
        `Reconciled ${applicationsNeedingReconciliation.length} applications`,
      );
      await fetchCohortData();
    } catch (error) {
      log.error("Bulk reconciliation error:", error);
      toast.error("Some reconciliations failed");
    }
  }, [applications, fetchCohortData]); // eslint-disable-line react-hooks/exhaustive-deps

  useAdminFetchOnce({
    authenticated,
    isAdmin,
    walletKey: user?.wallet?.address || null,
    keys: [cohortId as string | undefined],
    fetcher: fetchCohortData,
  });

  if (authLoading || loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  if (!cohort) {
    return (
      <AdminLayout>
        <div className="max-w-xl mx-auto py-12">
          <NetworkError
            error={error || "Cohort not found"}
            onRetry={handleRefresh}
            isRetrying={refreshing || authLoading || loading}
          />
        </div>
      </AdminLayout>
    );
  }
  const filteredApplications = applications.filter((app) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "needs_reconciliation")
      return app.needs_reconciliation;
    return app.user_application_status === statusFilter;
  });

  const getStatusBadge = (
    status: string,
    needsReconciliation: boolean = false,
  ) => {
    if (needsReconciliation) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <AlertCircle className="w-3 h-3 mr-1" />
          Needs Reconciliation
        </span>
      );
    }

    const statusColors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-800",
      payment_pending: "bg-yellow-100 text-yellow-800",
      payment_processing: "bg-blue-100 text-blue-800",
      payment_failed: "bg-red-100 text-red-800",
      under_review: "bg-purple-100 text-purple-800",
      approved: "bg-green-100 text-green-800",
      enrolled: "bg-emerald-100 text-emerald-800",
      rejected: "bg-red-100 text-red-800",
      withdrawn: "bg-gray-100 text-gray-800",
    };

    const colorClass = statusColors[status] || "bg-gray-100 text-gray-800";

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
      >
        {status.replace("_", " ")}
      </span>
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {cohort.name}
              </h1>
              <p className="text-gray-600 mt-1">
                {cohort.bootcamp_program.name}
              </p>
              <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                <span>
                  Start: {new Date(cohort.start_date).toLocaleDateString()}
                </span>
                <span>
                  End: {new Date(cohort.end_date).toLocaleDateString()}
                </span>
                <span>
                  Capacity: {cohort.current_participants}/
                  {cohort.max_participants}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
              {stats && stats.needs_reconciliation > 0 && (
                <button
                  onClick={handleBulkReconcile}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Reconcile All ({stats.needs_reconciliation})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-6">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Users className="h-6 w-6 text-gray-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Total Applications
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {stats.total_applications}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Clock className="h-6 w-6 text-yellow-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Pending Payment
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {stats.pending_payment}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <CreditCard className="h-6 w-6 text-green-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Payment Completed
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {stats.payment_completed}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <CheckCircle className="h-6 w-6 text-emerald-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Enrolled
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {stats.enrolled}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <CreditCard className="h-6 w-6 text-blue-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Revenue
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        ₦{stats.revenue.toLocaleString()}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            {stats.needs_reconciliation > 0 && (
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <AlertCircle className="h-6 w-6 text-red-400" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Need Reconciliation
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {stats.needs_reconciliation}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Applications Table */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">
                Applications
              </h3>
              <div className="flex items-center space-x-3">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Applications</option>
                  <option value="needs_reconciliation">
                    Needs Reconciliation
                  </option>
                  <option value="payment_pending">Payment Pending</option>
                  <option value="payment_completed">Payment Completed</option>
                  <option value="enrolled">Enrolled</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Applicant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Experience
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Applied
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredApplications.map((application) => (
                  <tr key={application.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {application.user_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {application.user_email}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                      {application.experience_level}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(
                        application.user_application_status,
                        application.needs_reconciliation,
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {application.amount_paid ? (
                        `${application.currency} ${application.amount_paid.toLocaleString()}`
                      ) : (
                        <span className="text-gray-500">Not paid</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(application.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {application.needs_reconciliation && (
                        <button
                          onClick={() =>
                            handleReconcileApplication(application.id)
                          }
                          className="text-red-600 hover:text-red-900 mr-3"
                        >
                          Reconcile
                        </button>
                      )}
                      <button
                        onClick={() =>
                          router.push(`/admin/applications/${application.id}`)
                        }
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
