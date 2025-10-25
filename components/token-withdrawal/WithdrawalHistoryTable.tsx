/**
 * WithdrawalHistoryTable Component
 *
 * Displays user's withdrawal history in a paginated table.
 * Shows status, amount, date, and transaction links.
 */

import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import type { WithdrawalRecord } from "@/lib/token-withdrawal/types";
import { getLogger } from "@/lib/utils/logger";
import { getBlockExplorerUrl } from "@/lib/blockchain/services/transaction-service";

const log = getLogger("components:WithdrawalHistoryTable");

export function WithdrawalHistoryTable() {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const limit = 10;

  useEffect(() => {
    fetchHistory();
  }, [page]);

  const fetchHistory = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        `/api/token/withdraw/history?limit=${limit}&offset=${page * limit}`,
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch history");
      }

      setWithdrawals(data.withdrawals);
      setTotal(data.total);
    } catch (err) {
      log.error("Failed to fetch withdrawal history", { error: err });
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const classes = "px-2 py-1 text-xs font-medium rounded-full";
    switch (status) {
      case "completed":
        return (
          <span className={`${classes} bg-green-900/20 text-green-300`}>
            Completed
          </span>
        );
      case "pending":
        return (
          <span className={`${classes} bg-yellow-900/20 text-yellow-300`}>
            Pending
          </span>
        );
      case "failed":
        return (
          <span className={`${classes} bg-red-900/20 text-red-300`}>Failed</span>
        );
      default:
        return (
          <span className={`${classes} bg-purple-900/20 text-purple-200`}>
            {status}
          </span>
        );
    }
  };

  if (isLoading && withdrawals.length === 0) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-flame-yellow/20 border-t-flame-yellow"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/20 border border-red-500/20 rounded-md">
        <p className="text-sm text-red-300">{error}</p>
      </div>
    );
  }

  if (withdrawals.length === 0) {
    return (
      <div className="text-center py-8 text-faded-grey">
        <svg
          className="mx-auto h-12 w-12 text-faded-grey"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
        <p className="mt-2">No pullouts yet</p>
      </div>
    );
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-purple-500/20">
          <thead className="bg-background/10">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-faded-grey uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-faded-grey uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-faded-grey uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-faded-grey uppercase tracking-wider">
                Transaction
              </th>
            </tr>
          </thead>
          <tbody className="bg-background divide-y divide-purple-500/10">
            {withdrawals.map((withdrawal) => (
              <tr key={withdrawal.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                  {format(new Date(withdrawal.created_at), "MMM d, yyyy HH:mm")}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                  {withdrawal.amount_dg.toLocaleString()} DG
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(withdrawal.status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {withdrawal.transaction_hash ? (
                    <a
                      href={getBlockExplorerUrl(withdrawal.transaction_hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-flame-yellow hover:text-flame-orange"
                    >
                      View →
                    </a>
                  ) : withdrawal.error_message ? (
                    <span
                      className="text-red-300 text-xs"
                      title={withdrawal.error_message}
                    >
                      Error
                    </span>
                  ) : (
                    <span className="text-faded-grey">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-purple-500/20 sm:px-6">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="relative inline-flex items-center px-4 py-2 border border-purple-500/30 text-sm font-medium rounded-md text-white bg-background hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-purple-500/30 text-sm font-medium rounded-md text-white bg-background hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-faded-grey">
                Showing <span className="font-medium">{page * limit + 1}</span>{" "}
                to{" "}
                <span className="font-medium">
                  {Math.min((page + 1) * limit, total)}
                </span>{" "}
                of <span className="font-medium">{total}</span> results
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-purple-500/30 bg-background text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Previous</span>
                  <svg
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-purple-500/30 bg-background text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Next</span>
                  <svg
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
