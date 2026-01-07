import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/layouts/AdminLayout";
import { NetworkError } from "@/components/ui/network-error";
import AdminResponsiveTable from "@/components/admin/AdminResponsiveTable";
import ConfirmationDialog from "@/components/ui/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw, Trash2 } from "lucide-react";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useDebounce } from "@/hooks/useDebounce";
import { getLogger } from "@/lib/utils/logger";
import { toast } from "react-hot-toast";

const log = getLogger("admin:csp-reports");

interface CspReport {
  id: string;
  received_at: string;
  ip: string | null;
  user_agent: string | null;
  document_uri: string;
  violated_directive: string;
  blocked_uri: string | null;
  source_file: string | null;
  line_number: number | null;
  column_number: number | null;
  status_code: number | null;
  raw_report: any;
}

const DEFAULT_LIMIT = 20;

export default function AdminCspReportsPage() {
  const apiOptions = useMemo(() => ({ suppressToasts: true }), []);
  const { adminFetch } = useAdminApi(apiOptions);

  const [reports, setReports] = useState<CspReport[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [directive, setDirective] = useState("");
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    reportId: string;
    type: "single" | "all";
  }>({
    isOpen: false,
    reportId: "",
    type: "single",
  });

  const debouncedQuery = useDebounce(query, 300);

  const fetchReports = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
      if (directive) params.set("directive", directive);

      const result = await adminFetch<{ reports: CspReport[]; total: number }>(
        `/api/admin/csp-reports?${params.toString()}`,
      );

      if (result.error) {
        throw new Error(result.error);
      }

      setReports(result.data?.reports || []);
      setTotal(result.data?.total || 0);
    } catch (err: any) {
      log.error("Error fetching CSP reports", err);
      setError(err?.message || "Failed to load CSP reports");
    } finally {
      setIsLoading(false);
    }
  }, [adminFetch, limit, offset, debouncedQuery, directive]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await fetchReports();
    } finally {
      setIsRetrying(false);
    }
  };

  const openDeleteConfirmation = (reportId: string) => {
    setDeleteConfirmation({
      isOpen: true,
      reportId,
      type: "single",
    });
  };

  const openClearAllConfirmation = () => {
    setDeleteConfirmation({
      isOpen: true,
      reportId: "",
      type: "all",
    });
  };

  const closeDeleteConfirmation = () => {
    setDeleteConfirmation({
      isOpen: false,
      reportId: "",
      type: "single",
    });
  };

  const handleDeleteConfirm = async () => {
    if (deleteConfirmation.type === "all") {
      setIsClearing(true);
      try {
        const result = await adminFetch(`/api/admin/csp-reports?clearAll=true`, {
          method: "DELETE",
        });

        if (result.error) {
          toast.error(result.error);
          return;
        }

        toast.success("All reports cleared");
        setOffset(0);
        await fetchReports();
        closeDeleteConfirmation();
      } catch (err: any) {
        log.error("Failed to clear reports", err);
        toast.error("Failed to clear reports");
      } finally {
        setIsClearing(false);
      }
    } else {
      const id = deleteConfirmation.reportId;
      setIsDeleting(id);
      try {
        const result = await adminFetch(`/api/admin/csp-reports?id=${id}`, {
          method: "DELETE",
        });

        if (result.error) {
          toast.error(result.error);
          return;
        }

        toast.success("Report deleted");
        await fetchReports();
        closeDeleteConfirmation();
      } catch (err: any) {
        log.error("Failed to delete report", err);
        toast.error("Failed to delete report");
      } finally {
        setIsDeleting(null);
      }
    }
  };

  const formattedReports = useMemo(() => {
    return reports.map((report) => {
      const when = new Date(report.received_at).toLocaleString();
      const location = report.source_file
        ? `${report.source_file}${report.line_number ? `:${report.line_number}` : ""}${report.column_number ? `:${report.column_number}` : ""}`
        : "—";
      return {
        ...report,
        when,
        location,
      };
    });
  }, [reports]);

  const directiveOptions = useMemo(() => {
    const known = [
      "default-src",
      "script-src",
      "style-src",
      "img-src",
      "connect-src",
      "frame-src",
      "font-src",
      "object-src",
      "media-src",
      "worker-src",
      "manifest-src",
      "base-uri",
      "form-action",
    ];
    const observed = reports.map((r) => r.violated_directive).filter(Boolean);
    return Array.from(new Set([...known, ...observed]));
  }, [reports]);

  const hasNextPage = offset + limit < total;
  const hasPrevPage = offset > 0;

  const columns = useMemo(
    () => [
      {
        key: "violated_directive",
        label: "Directive",
        mobilePriority: "high" as const,
        render: (value: string) => (
          <span className="text-sm font-semibold text-rose-300">
            {value || "—"}
          </span>
        ),
      },
      {
        key: "document_uri",
        label: "Document",
        mobilePriority: "high" as const,
        render: (value: string) => (
          <span className="text-sm text-gray-200 break-words">{value}</span>
        ),
      },
      {
        key: "when",
        label: "When",
        mobilePriority: "high" as const,
        render: (value: string) => (
          <span className="text-xs text-gray-400">{value}</span>
        ),
      },
      {
        key: "blocked_uri",
        label: "Blocked URI",
        mobilePriority: "medium" as const,
        render: (value: string) => (
          <span className="text-sm text-gray-300 break-words">
            {value || "—"}
          </span>
        ),
      },
      {
        key: "status_code",
        label: "Status",
        mobilePriority: "medium" as const,
        render: (value: number) => (
          <span className="text-sm text-gray-300">{value || "—"}</span>
        ),
      },
      {
        key: "location",
        label: "Source",
        mobilePriority: "low" as const,
        render: (value: string) => (
          <span className="text-xs text-gray-400 break-words">{value}</span>
        ),
      },
      {
        key: "ip",
        label: "IP",
        mobilePriority: "low" as const,
        render: (value: string) => (
          <span className="text-xs text-gray-400">{value || "—"}</span>
        ),
      },
      {
        key: "user_agent",
        label: "User Agent",
        mobilePriority: "low" as const,
        render: (value: string) => (
          <span className="text-xs text-gray-400 break-words">
            {value || "—"}
          </span>
        ),
      },
      {
        key: "raw_report",
        label: "Details",
        mobilePriority: "low" as const,
        render: (value: any) => {
          if (!value) return <span className="text-xs text-gray-500">—</span>;
          const raw = JSON.stringify(value, null, 2);
          return (
            <details className="text-xs text-gray-300">
              <summary className="cursor-pointer text-flame-yellow">
                View report
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-words text-gray-300">
                {raw}
              </pre>
            </details>
          );
        },
      },
      {
        key: "id",
        label: "",
        mobilePriority: "high" as const,
        render: (value: string) => (
          <button
            onClick={() => openDeleteConfirmation(value)}
            disabled={isDeleting === value}
            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors disabled:opacity-50"
            title="Delete report"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ),
      },
    ],
    [openDeleteConfirmation, isDeleting],
  );

  return (
    <AdminLayout>
      <div className="w-full space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              CSP Reports
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              Review Content Security Policy violations and prioritize fixes.
            </p>
          </div>
          <div className="flex gap-2">
            {total > 0 && (
              <Button
                variant="outline"
                className="border-red-700 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                onClick={openClearAllConfirmation}
                disabled={isLoading || isClearing}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {isClearing ? "Clearing..." : "Clear All"}
              </Button>
            )}
            <Button
              variant="outline"
              className="border-gray-700 text-gray-200 hover:text-white"
              onClick={fetchReports}
              disabled={isLoading}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-400 mb-1">
              Search by document, directive, blocked URI, or source file
            </label>
            <input
              value={query}
              onChange={(event) => {
                setOffset(0);
                setQuery(event.target.value);
              }}
              placeholder="Search CSP reports"
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder-gray-600"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Directive
            </label>
            <select
              value={directive}
              onChange={(event) => {
                setOffset(0);
                setDirective(event.target.value);
              }}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200"
            >
              <option value="">All directives</option>
              {directiveOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm text-gray-400">
          <div>
            Showing {reports.length} of {total} reports
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="border-gray-700 text-gray-200 hover:text-white"
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={!hasPrevPage || isLoading}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              className="border-gray-700 text-gray-200 hover:text-white"
              onClick={() => setOffset(offset + limit)}
              disabled={!hasNextPage || isLoading}
            >
              Next
            </Button>
            <select
              value={limit}
              onChange={(event) => {
                setOffset(0);
                setLimit(Number(event.target.value));
              }}
              className="rounded-md border border-gray-700 bg-gray-900 px-2 py-2 text-xs text-gray-200"
            >
              {[10, 20, 50].map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <NetworkError
            error={error}
            onRetry={handleRetry}
            isRetrying={isRetrying}
          />
        )}

        {isLoading && !error && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-flame-yellow"></div>
          </div>
        )}

        {!isLoading && !error && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <AdminResponsiveTable
              columns={columns}
              data={formattedReports}
              emptyMessage="No CSP reports found"
            />
          </div>
        )}
      </div>

      <ConfirmationDialog
        isOpen={deleteConfirmation.isOpen}
        onClose={closeDeleteConfirmation}
        onConfirm={handleDeleteConfirm}
        title={
          deleteConfirmation.type === "all"
            ? "Clear All CSP Reports"
            : "Delete CSP Report"
        }
        description={
          deleteConfirmation.type === "all"
            ? `Are you sure you want to delete all ${total} CSP reports? This action cannot be undone.`
            : "Are you sure you want to delete this CSP report? This action cannot be undone."
        }
        confirmText={deleteConfirmation.type === "all" ? "Clear All" : "Delete"}
        variant="danger"
        isLoading={isDeleting !== null || isClearing}
      />
    </AdminLayout>
  );
}
