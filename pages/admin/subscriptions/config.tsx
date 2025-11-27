import { useState, useCallback, useMemo } from "react";
import AdminEditPageLayout from "@/components/admin/AdminEditPageLayout";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useAdminAuthContext } from "@/contexts/admin-context";
import { useAdminFetchOnce } from "@/hooks/useAdminFetchOnce";
import { getLogger } from "@/lib/utils/logger";
import { toast } from "react-hot-toast";

const log = getLogger("admin:subscriptions:config");

interface SubscriptionConfig {
  xpServiceFeePercent: number;
  treasuryBalance: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export default function SubscriptionsConfigPage() {
  const { authenticated, isAdmin, isLoadingAuth, user } = useAdminAuthContext();
  const adminApiOptions = useMemo(() => ({ suppressToasts: true }), []);
  const { adminFetch } = useAdminApi(adminApiOptions);

  const [config, setConfig] = useState<SubscriptionConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [editedFeePercent, setEditedFeePercent] = useState(1.0);
  const [isSavingFee, setIsSavingFee] = useState(false);

  // Burn state
  const [burnAmount, setBurnAmount] = useState("");
  const [burnReason, setBurnReason] = useState("");
  const [isBurning, setIsBurning] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await adminFetch<{
        success: boolean;
        data: SubscriptionConfig;
      }>("/api/admin/subscriptions/config");

      if (result.error) {
        throw new Error(result.error);
      }

      if (!result.data?.data) {
        throw new Error("Failed to load config");
      }

      log.info("Config fetched", {
        feePercent: result.data.data.xpServiceFeePercent,
        balance: result.data.data.treasuryBalance,
      });

      setConfig(result.data.data);
      setEditedFeePercent(result.data.data.xpServiceFeePercent);
    } catch (err: any) {
      log.error("Error fetching config:", err);
      setError(err.message || "Failed to load configuration");
    } finally {
      setIsLoading(false);
    }
  }, [adminFetch]);

  useAdminFetchOnce({
    authenticated,
    isAdmin,
    walletKey: user?.wallet?.address || null,
    fetcher: fetchConfig,
  });

  const handleSaveFee = async () => {
    try {
      if (!config) return;

      // Client-side validation
      if (editedFeePercent < 0.5 || editedFeePercent > 3.0) {
        toast.error("Service fee must be between 0.5% and 3.0%");
        return;
      }

      if (editedFeePercent === config.xpServiceFeePercent) {
        toast.error("No changes to save");
        return;
      }

      setIsSavingFee(true);

      const result = await adminFetch<{
        success: boolean;
        data: SubscriptionConfig;
      }>("/api/admin/subscriptions/config", {
        method: "PUT",
        body: JSON.stringify({ xpServiceFeePercent: editedFeePercent }),
      });

      if (result.error) {
        throw new Error(result.error);
      }

      if (!result.data?.success) {
        throw new Error("Failed to update fee");
      }

      setConfig({
        ...config,
        xpServiceFeePercent: editedFeePercent,
        updatedAt: new Date().toISOString(),
      });

      toast.success("Service fee updated successfully");
      log.info("Service fee saved", { newFee: editedFeePercent });
    } catch (err: any) {
      log.error("Error saving fee:", err);
      toast.error(err.message || "Failed to save fee");
    } finally {
      setIsSavingFee(false);
    }
  };

  const handleBurnTreasury = async () => {
    try {
      if (!config) return;

      const amount = parseFloat(burnAmount);

      // Client-side validation
      if (!amount || amount <= 0) {
        toast.error("Burn amount must be greater than 0");
        return;
      }

      if (amount > config.treasuryBalance) {
        toast.error(
          `Insufficient balance. Available: ${config.treasuryBalance} XP`,
        );
        return;
      }

      // Confirm action
      const confirmed = window.confirm(
        `Burn ${amount} XP from treasury? This action cannot be undone.`,
      );
      if (!confirmed) return;

      setIsBurning(true);

      const result = await adminFetch<{
        success: boolean;
        data: SubscriptionConfig;
      }>("/api/admin/subscriptions/config", {
        method: "POST",
        body: JSON.stringify({
          xpAmountToBurn: amount,
          reason: burnReason || "Manual admin burn",
        }),
      });

      if (result.error) {
        throw new Error(result.error);
      }

      if (!result.data?.success) {
        throw new Error("Failed to burn treasury");
      }

      setConfig({
        ...config,
        treasuryBalance: result.data.data.treasuryBalance,
        updatedAt: new Date().toISOString(),
      });

      toast.success(`Burned ${amount} XP successfully`);
      setBurnAmount("");
      setBurnReason("");

      log.info("Treasury burned", { amount, reason: burnReason });
    } catch (err: any) {
      log.error("Error burning treasury:", err);
      toast.error(err.message || "Failed to burn treasury");
    } finally {
      setIsBurning(false);
    }
  };

  const [isRetrying, setIsRetrying] = useState(false);
  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await fetchConfig();
    } finally {
      setIsRetrying(false);
    }
  };

  const feeHasChanges =
    config && editedFeePercent !== config.xpServiceFeePercent;

  return (
    <AdminEditPageLayout
      title="Subscription Configuration"
      backLinkHref="/admin"
      backLinkText="Back to Dashboard"
      isLoading={isLoadingAuth || isLoading}
      error={error}
      onRetry={handleRetry}
      isRetrying={isRetrying}
    >
      {config && (
        <div className="space-y-6">
          {/* Service Fee Configuration */}
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-6">
            <h2 className="mb-4 text-lg font-medium text-white">
              Service Fee Configuration
            </h2>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Current Fee:{" "}
                  <span className="font-bold">
                    {config.xpServiceFeePercent}%
                  </span>
                </label>
              </div>

              <div>
                <label
                  htmlFor="feePercent"
                  className="mb-2 block text-sm font-medium text-gray-300"
                >
                  New Fee Percentage
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    id="feePercent"
                    value={editedFeePercent}
                    onChange={(e) =>
                      setEditedFeePercent(parseFloat(e.target.value) || 1.0)
                    }
                    step="0.1"
                    min="0.5"
                    max="3.0"
                    className="w-32 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white focus:border-flame-yellow focus:outline-none focus:ring-2 focus:ring-flame-yellow"
                  />
                  <span className="text-gray-400">%</span>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Valid range: 0.5% - 3.0%
                </p>
              </div>

              <button
                onClick={handleSaveFee}
                disabled={isSavingFee || !feeHasChanges}
                className="w-full rounded-md bg-flame-yellow px-4 py-2 font-medium text-black hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-flame-yellow focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSavingFee ? "Saving..." : "Save Fee"}
              </button>
            </div>
          </div>

          {/* Treasury Management */}
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-6">
            <h2 className="mb-4 text-lg font-medium text-white">
              Treasury Management
            </h2>

            <div className="mb-6 rounded-lg border border-slate-600 bg-slate-800/50 p-4">
              <p className="text-sm text-gray-400">Treasury Balance</p>
              <p className="text-3xl font-bold text-white">
                {config.treasuryBalance} XP
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="burnAmount"
                  className="mb-2 block text-sm font-medium text-gray-300"
                >
                  XP Amount to Burn
                </label>
                <input
                  type="number"
                  id="burnAmount"
                  value={burnAmount}
                  onChange={(e) => setBurnAmount(e.target.value)}
                  min="0"
                  max={config.treasuryBalance}
                  placeholder="Enter amount"
                  className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white focus:border-flame-yellow focus:outline-none focus:ring-2 focus:ring-flame-yellow"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Maximum: {config.treasuryBalance} XP
                </p>
              </div>

              <div>
                <label
                  htmlFor="burnReason"
                  className="mb-2 block text-sm font-medium text-gray-300"
                >
                  Reason{" "}
                  <span className="text-xs text-gray-500">(optional)</span>
                </label>
                <input
                  type="text"
                  id="burnReason"
                  value={burnReason}
                  onChange={(e) => setBurnReason(e.target.value)}
                  placeholder="e.g., Slashing for delays, Redistribute to users..."
                  className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white focus:border-flame-yellow focus:outline-none focus:ring-2 focus:ring-flame-yellow"
                />
                <p className="mt-1 text-xs text-gray-400">
                  For audit documentation only
                </p>
              </div>

              <div className="rounded-md border border-amber-700/50 bg-amber-900/20 p-3">
                <p className="text-sm text-amber-300">
                  ⚠️ Warning: Burning treasury cannot be undone
                </p>
              </div>

              <button
                onClick={handleBurnTreasury}
                disabled={
                  isBurning ||
                  !burnAmount ||
                  parseFloat(burnAmount) <= 0 ||
                  parseFloat(burnAmount) > config.treasuryBalance
                }
                className="w-full rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBurning ? "Burning..." : "Burn Treasury"}
              </button>
            </div>
          </div>

          {/* Info Section */}
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-6">
            <h3 className="mb-3 text-sm font-medium text-gray-300">
              Configuration Info
            </h3>
            <div className="space-y-2 text-sm text-gray-400">
              <div className="flex justify-between">
                <span>Last Updated:</span>
                <span>
                  {config.updatedAt
                    ? new Date(config.updatedAt).toLocaleString()
                    : "Never"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminEditPageLayout>
  );
}
