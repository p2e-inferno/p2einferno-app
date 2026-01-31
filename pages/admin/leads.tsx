import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/layouts/AdminLayout";
import { NetworkError } from "@/components/ui/network-error";
import AdminResponsiveTable from "@/components/admin/AdminResponsiveTable";
import ConfirmationDialog from "@/components/ui/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw, FileDown, Trash2 } from "lucide-react";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useDebounce } from "@/hooks/useDebounce";
import { getLogger } from "@/lib/utils/logger";
import { toast } from "react-hot-toast";
import { usePrivy } from "@privy-io/react-auth";

const log = getLogger("admin:leads");

interface Lead {
  id: string;
  created_at: string;
  name: string | null;
  email: string;
  intent: string;
  source: string | null;
  track_label: string | null;
  metadata: any;
}

const DEFAULT_LIMIT = 20;

export default function AdminLeadsPage() {
  const apiOptions = useMemo(() => ({ suppressToasts: true }), []);
  const { adminFetch } = useAdminApi(apiOptions);
  const { getAccessToken } = usePrivy();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [intent, setIntent] = useState("");

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    ids: string[];
  }>({
    isOpen: false,
    ids: [],
  });

  const debouncedQuery = useDebounce(query, 300);

  // Reset selection when filtering/pagination changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [debouncedQuery, intent, offset, limit]);

  const fetchLeads = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
      if (intent) params.set("intent", intent);

      const result = await adminFetch<{ leads: Lead[]; total: number }>(
        `/api/admin/leads?${params.toString()}`,
      );

      if (result.error) throw new Error(result.error);

      setLeads(result.data?.leads || []);
      setTotal(result.data?.total || 0);
    } catch (err: any) {
      log.error("Error fetching leads", err);
      setError(err?.message || "Failed to load leads");
    } finally {
      setIsLoading(false);
    }
  }, [adminFetch, limit, offset, debouncedQuery, intent]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleExport = async (format: "csv" | "json") => {
    try {
      setIsExporting(true);
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");

      const params = new URLSearchParams();
      if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
      if (intent) params.set("intent", intent);

      // If selection exists, pass ids
      if (selectedIds.size > 0) {
        params.set("ids", Array.from(selectedIds).join(","));
      }

      params.set("export", format);

      const response = await fetch(`/api/admin/leads?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads-${new Date().toISOString()}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(
        `Exported ${selectedIds.size > 0 ? selectedIds.size + " selected" : "all"} leads as ${format.toUpperCase()}`,
      );
    } catch (err: any) {
      log.error("Export error", err);
      toast.error("Failed to export leads");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = (idsToDelete?: string[]) => {
    const targetIds = idsToDelete || Array.from(selectedIds);

    if (targetIds.length === 0) return;

    setDeleteConfirmation({
      isOpen: true,
      ids: targetIds,
    });
  };

  const executeDelete = async () => {
    const targetIds = deleteConfirmation.ids;
    if (targetIds.length === 0) return;

    try {
      setIsDeleting(true);
      const res = await adminFetch("/api/admin/leads", {
        method: "DELETE",
        body: JSON.stringify({ ids: targetIds }),
      });

      if (res.error) throw new Error(res.error);

      toast.success(`Deleted ${targetIds.length} leads`);
      setSelectedIds(new Set());
      setDeleteConfirmation({ isOpen: false, ids: [] });
      fetchLeads(); // Refresh list
    } catch (err: any) {
      log.error("Delete error", err);
      toast.error(err.message || "Failed to delete leads");
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === leads.length && leads.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map((l) => l.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const hasNextPage = offset + limit < total;
  const hasPrevPage = offset > 0;

  const columns = useMemo(
    () => [
      {
        key: "select",
        label: "",
        mobilePriority: "high" as const,
        render: (_: unknown, row: Lead) => (
          <input
            type="checkbox"
            checked={selectedIds.has(row.id)}
            onChange={(e) => {
              e.stopPropagation();
              toggleSelect(row.id);
            }}
            className="rounded border-gray-600 bg-gray-800 text-flame-yellow focus:ring-flame-yellow"
          />
        ),
      },
      {
        key: "created_at",
        label: "Date",
        mobilePriority: "high" as const,
        render: (value: string) => (
          <span className="text-xs text-gray-400">
            {new Date(value).toLocaleDateString()}
          </span>
        ),
      },
      {
        key: "name",
        label: "Name",
        mobilePriority: "high" as const,
        render: (value: string | null) => (
          <span className="text-sm font-semibold text-white">
            {value || "—"}
          </span>
        ),
      },
      {
        key: "email",
        label: "Email",
        mobilePriority: "high" as const,
        render: (value: string) => (
          <span className="text-sm text-gray-300 break-words">{value}</span>
        ),
      },
      {
        key: "intent",
        label: "Intent",
        mobilePriority: "medium" as const,
        render: (value: string) => (
          <span className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300 border border-gray-700">
            {value}
          </span>
        ),
      },
      {
        key: "source",
        label: "Source",
        mobilePriority: "low" as const,
        render: (value: string | null) => (
          <span className="text-xs text-gray-400">{value || "—"}</span>
        ),
      },
      {
        key: "track_label",
        label: "Track",
        mobilePriority: "low" as const,
        render: (value: string | null) => (
          <span className="text-xs text-gray-400">{value || "—"}</span>
        ),
      },
      {
        key: "metadata",
        label: "Metadata",
        mobilePriority: "low" as const,
        render: (value: any) => {
          if (!value || Object.keys(value).length === 0)
            return <span className="text-xs text-gray-500">—</span>;
          const raw = JSON.stringify(value, null, 2);
          return (
            <details className="text-xs text-gray-300">
              <summary className="cursor-pointer text-flame-yellow">
                View
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-words text-gray-300 bg-gray-900/50 p-2 rounded">
                {raw}
              </pre>
            </details>
          );
        },
      },
      {
        key: "actions",
        label: "",
        mobilePriority: "high" as const,
        render: (_: unknown, row: Lead) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete([row.id]);
            }}
            className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
            title="Delete Lead"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ),
      },
    ],
    [selectedIds, leads],
  );

  return (
    <AdminLayout>
      <div className="w-full space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              Marketing Leads
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              View and manage collected leads from marketing campaigns.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="border-gray-700 text-gray-200 hover:text-white"
              onClick={() => handleExport("csv")}
              disabled={isExporting}
            >
              <FileDown className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              className="border-gray-700 text-gray-200 hover:text-white"
              onClick={() => handleExport("json")}
              disabled={isExporting}
            >
              <Download className="w-4 h-4 mr-2" />
              Export JSON
            </Button>
            <Button
              variant="outline"
              className="border-gray-700 text-gray-200 hover:text-white"
              onClick={fetchLeads}
              disabled={isLoading}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-3">
            <label className="block text-xs text-gray-400 mb-1">
              Search by name or email
            </label>
            <input
              value={query}
              onChange={(e) => {
                setOffset(0);
                setQuery(e.target.value);
              }}
              placeholder="Search leads..."
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Intent</label>
            <select
              value={intent}
              onChange={(e) => {
                setOffset(0);
                setIntent(e.target.value);
              }}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200"
            >
              <option value="">All Intents</option>
              <option value="starter_kit">Starter Kit</option>
              <option value="bootcamp_waitlist">Bootcamp Waitlist</option>
              <option value="track_waitlist">Track Waitlist</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm text-gray-400">
          <div>
            Showing {leads.length > 0 ? offset + 1 : 0} to{" "}
            {Math.min(offset + leads.length, total)} of {total} leads
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
              {[20, 50, 100].map((size) => (
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
            onRetry={fetchLeads}
            isRetrying={isLoading}
          />
        )}

        {isLoading && !error && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-flame-yellow"></div>
          </div>
        )}

        {!isLoading && !error && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            {/* Bulk Actions Header */}
            {/* Bulk Actions Header - Min height prevents layout shift */}
            <div className="p-3 border-b border-gray-800 flex items-center gap-3 bg-gray-900/50 min-h-[56px]">
              <input
                type="checkbox"
                checked={leads.length > 0 && selectedIds.size === leads.length}
                onChange={toggleSelectAll}
                className="rounded border-gray-600 bg-gray-800 text-flame-yellow focus:ring-flame-yellow"
              />
              <span className="text-xs text-gray-400">
                {selectedIds.size} selected
              </span>
              <Button
                size="sm"
                onClick={() => handleDelete()}
                className={`ml-auto bg-red-900/20 text-red-400 hover:bg-red-900/40 hover:text-red-300 border border-red-900/50 text-xs h-8 ${selectedIds.size === 0 ? "invisible pointer-events-none" : ""}`}
                disabled={isDeleting}
              >
                <Trash2 className="w-3 h-3 mr-1.5" />
                Delete Selected
              </Button>
            </div>
            <AdminResponsiveTable
              columns={columns}
              data={leads}
              emptyMessage="No leads found."
            />
          </div>
        )}

        <ConfirmationDialog
          isOpen={deleteConfirmation.isOpen}
          onClose={() => setDeleteConfirmation({ isOpen: false, ids: [] })}
          onConfirm={executeDelete}
          title="Delete Leads"
          description={`Are you sure you want to delete ${deleteConfirmation.ids.length} lead(s)? This action cannot be undone.`}
          confirmText="Delete"
          variant="danger"
          isLoading={isDeleting}
        />
      </div>
    </AdminLayout>
  );
}
