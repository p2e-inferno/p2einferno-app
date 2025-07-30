import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { toast } from "react-hot-toast";
import AdminLayout from "@/components/layouts/AdminLayout";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import AdminAccessRequired from "@/components/admin/AdminAccessRequired";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle, ExternalLink } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";

interface PaymentTransaction {
  id: string;
  application_id: string;
  payment_reference: string;
  status: string;
  transaction_hash: string | null;
  network_chain_id: number | null;
  created_at: string;
  updated_at: string;
  metadata: any;
  applications: {
    user_email: string;
    cohorts: {
      name: string;
      lock_address: string;
    };
    user_profiles: {
      wallet_address: string;
    };
  };
}

const AdminPaymentsPage: React.FC = () => {
  const { isAdmin, loading: authLoading, authenticated } = useAdminAuth();
  const { getAccessToken } = usePrivy();
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  const fetchTransactions = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/payments", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch transactions");
      }

      const data = await response.json();
      setTransactions(data.transactions || []);
    } catch (err) {
      console.error("Error fetching transactions:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch transactions"
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (authenticated && isAdmin && isClient) {
      fetchTransactions();
    }
  }, [authenticated, isAdmin, isClient]);

  const handleReconcile = async (applicationId: string) => {
    try {
      setReconcilingIds((prev) => new Set(prev).add(applicationId));

      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/payments/reconcile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ applicationId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Reconciliation failed");
      }

      if (result.reconciled) {
        toast.success("Payment reconciled successfully!");
        // Refresh the list
        await fetchTransactions();
      } else {
        toast.error(result.message || "No valid key found for this user");
      }
    } catch (err) {
      console.error("Reconciliation error:", err);
      toast.error(err instanceof Error ? err.message : "Reconciliation failed");
    } finally {
      setReconcilingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(applicationId);
        return newSet;
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium";
    switch (status) {
      case "processing":
        return `${baseClasses} bg-yellow-900/30 text-yellow-300 border border-yellow-700`;
      case "failed":
        return `${baseClasses} bg-red-900/30 text-red-300 border border-red-700`;
      case "pending":
        return `${baseClasses} bg-blue-900/30 text-blue-300 border border-blue-700`;
      default:
        return `${baseClasses} bg-gray-900/30 text-gray-300 border border-gray-700`;
    }
  };

  const getBlockExplorerUrl = (txHash: string, chainId: number) => {
    // Base mainnet and testnet explorer URLs
    const explorers: Record<number, string> = {
      8453: "https://basescan.org", // Base mainnet
      84532: "https://sepolia.basescan.org", // Base Sepolia testnet
    };

    const explorerUrl = explorers[chainId] || "https://basescan.org";
    return `${explorerUrl}/tx/${txHash}`;
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
      <AdminAccessRequired message="You need admin access to view payment transactions" />
    );
  }

  return (
    <AdminLayout>
      <div className="w-full">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Payment Transactions
            </h1>
            <p className="text-gray-400 mt-1">
              Manage transactions requiring attention
            </p>
          </div>
          <Button
            onClick={fetchTransactions}
            disabled={isLoading}
            className="bg-steel-red hover:bg-steel-red/90 text-white"
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-flame-yellow"></div>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded mb-6 flex items-center">
            <AlertCircle className="w-5 h-5 mr-2" />
            {error}
          </div>
        ) : transactions.length === 0 ? (
          <div className="bg-card border border-gray-800 rounded-lg p-12 text-center">
            <h3 className="text-lg font-semibold text-white mb-2">
              No transactions requiring attention
            </h3>
            <p className="text-gray-400">
              All payment transactions are currently in a resolved state.
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
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Transaction
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Updated
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {transactions.map((transaction) => (
                    <tr key={transaction.id} className="hover:bg-gray-900/30">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-mono text-gray-300">
                          {transaction.application_id.slice(0, 8)}...
                        </div>
                        <div className="text-xs text-gray-500">
                          {transaction.payment_reference}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-300">
                          {transaction.applications.user_email}
                        </div>
                        {transaction.applications.user_profiles
                          ?.wallet_address && (
                          <div className="text-xs font-mono text-gray-500">
                            {transaction.applications.user_profiles.wallet_address.slice(
                              0,
                              6
                            )}
                            ...
                            {transaction.applications.user_profiles.wallet_address.slice(
                              -4
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-300">
                          {transaction.applications.cohorts?.name || "Unknown"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={getStatusBadge(transaction.status)}>
                          {transaction.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {transaction.transaction_hash ? (
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-mono text-gray-300">
                              {transaction.transaction_hash.slice(0, 8)}...
                            </span>
                            {transaction.network_chain_id && (
                              <a
                                href={getBlockExplorerUrl(
                                  transaction.transaction_hash,
                                  transaction.network_chain_id
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-flame-yellow hover:text-flame-yellow/80"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">No hash</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                        {new Date(transaction.updated_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Button
                          onClick={() =>
                            handleReconcile(transaction.application_id)
                          }
                          disabled={reconcilingIds.has(
                            transaction.application_id
                          )}
                          size="sm"
                          className="bg-flame-yellow hover:bg-flame-yellow/90 text-black"
                        >
                          {reconcilingIds.has(transaction.application_id) ? (
                            <>
                              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                              Reconciling...
                            </>
                          ) : (
                            "Reconcile"
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminPaymentsPage;
