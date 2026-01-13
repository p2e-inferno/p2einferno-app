import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/router";
import AdminLayout from "@/components/layouts/AdminLayout";
import LockManagerRetryButton from "@/components/admin/LockManagerRetryButton";
import MaxKeysSecurityButton from "@/components/admin/MaxKeysSecurityButton";
import SyncLockStateButton from "@/components/admin/SyncLockStateButton";
import { MaxKeysSecurityBadge } from "@/components/admin/MaxKeysSecurityBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Edit,
  Coins,
  Users,
  CheckCircle2,
  Clock,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import type { Quest } from "@/lib/supabase/types";
import { useAdminApi } from "@/hooks/useAdminApi";
import { NetworkError } from "@/components/ui/network-error";
import { useAdminAuthContext } from "@/contexts/admin-context";
import { useAdminFetchOnce } from "@/hooks/useAdminFetchOnce";
import { useIsLockManager } from "@/hooks/unlock/useIsLockManager";
import { useMaxNumberOfKeys } from "@/hooks/unlock/useMaxNumberOfKeys";
import QuestSubmissionsTable from "@/components/admin/QuestSubmissionsTable";
import { getLogger } from "@/lib/utils/logger";
import { toast } from "react-hot-toast";
import type { Address } from "viem";

const log = getLogger("admin:quests:[id]");

interface QuestDetails extends Quest {
  stats?: {
    total_users: number;
    completed_users: number;
    pending_submissions: number;
    completed_submissions: number;
    failed_submissions: number;
    completion_rate: number;
  };
  pending_submissions?: any[];
}

/**
 * Admin page that displays and manages detailed information for a single quest.
 *
 * Shows quest metadata, statistics, tasks, submissions, and controls for synchronizing
 * lock manager and purchase-security state between the database and the blockchain.
 *
 * @returns The React element rendering the admin UI for viewing and managing a quest's details, status, tasks, and submissions.
 */
export default function QuestDetailsPage() {
  const { authenticated, isAdmin, isLoadingAuth, user } = useAdminAuthContext();
  const router = useRouter();
  const { id } = router.query;
  const apiOptions = useMemo(() => ({ suppressToasts: true }), []);
  const { adminFetch } = useAdminApi(apiOptions);
  const [quest, setQuest] = useState<QuestDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [serverWalletAddress, setServerWalletAddress] = useState<string | null>(
    null,
  );
  const [actualManagerStatus, setActualManagerStatus] = useState<
    boolean | null
  >(null);
  const [activationManagerStatus, setActivationManagerStatus] = useState<
    boolean | null
  >(null);
  const [activationManagerError, setActivationManagerError] = useState<
    string | null
  >(null);
  const [actualMaxKeysValue, setActualMaxKeysValue] = useState<bigint | null>(
    null,
  );
  const activationLockAddress = useMemo(
    () => (quest?.activation_config as any)?.lockAddress || "",
    [quest?.activation_config],
  );

  const { checkIsLockManager } = useIsLockManager();
  const { checkMaxNumberOfKeys } = useMaxNumberOfKeys();

  // Reusable function to fetch quest details by id
  const fetchQuestDetails = useCallback(
    async (questId: string) => {
      try {
        setIsLoading(true);
        setError(null);

        const result = await adminFetch<{ quest: QuestDetails }>(
          `/api/admin/quests/${questId}`,
        );

        if (result.error) {
          throw new Error(result.error);
        }

        if (!result.data?.quest) {
          throw new Error("Quest not found");
        }

        setQuest(result.data.quest);
        try {
          log.info("Quest details loaded", {
            questId: result.data.quest.id,
            hasLockAddress: Boolean(result.data.quest.lock_address),
            lockManagerGranted: result.data.quest.lock_manager_granted,
            grantFailureReasonPresent: Boolean(
              result.data.quest.grant_failure_reason,
            ),
          });
        } catch {}

        if (
          result.data.quest.stats?.pending_submissions &&
          result.data.quest.stats.pending_submissions > 0
        ) {
          setActiveTab("submissions");
        }
      } catch (err: any) {
        log.error("Error fetching quest:", err);
        setError(err.message || "Failed to load quest details");
      } finally {
        setIsLoading(false);
      }
    },
    [adminFetch],
  );

  // Initial fetch on mount / id change with auth guard
  useAdminFetchOnce({
    authenticated,
    isAdmin,
    walletKey: user?.wallet?.address || null,
    keys: [id as string | undefined],
    fetcher: () => {
      if (typeof id === "string") {
        return fetchQuestDetails(id);
      }
    },
  });

  // Fetch server wallet address
  const fetchServerWallet = useCallback(async () => {
    try {
      const result = await adminFetch<{ serverWalletAddress: string }>(
        "/api/admin/server-wallet",
      );
      if (result.data?.serverWalletAddress) {
        setServerWalletAddress(result.data.serverWalletAddress);
      }
    } catch (err) {
      log.error("Failed to fetch server wallet address:", err);
    }
  }, [adminFetch]);

  // Check actual lock manager status on blockchain
  const checkActualManagerStatus = useCallback(async () => {
    if (!quest?.lock_address || !serverWalletAddress) return;

    try {
      const isManager = await checkIsLockManager(
        serverWalletAddress as Address,
        quest.lock_address as Address,
      );
      setActualManagerStatus(isManager);
    } catch (err) {
      log.error("Failed to check lock manager status:", err);
    }
  }, [quest?.lock_address, serverWalletAddress, checkIsLockManager]);

  // Check actual maxNumberOfKeys value on blockchain
  const checkActualMaxKeysValue = useCallback(async () => {
    if (!quest?.lock_address) return;

    try {
      const maxKeys = await checkMaxNumberOfKeys(quest.lock_address as Address);
      setActualMaxKeysValue(maxKeys);
    } catch (err) {
      log.error("Failed to check maxNumberOfKeys:", err);
    }
  }, [quest?.lock_address, checkMaxNumberOfKeys]);

  useEffect(() => {
    fetchServerWallet();
  }, [fetchServerWallet]);

  useEffect(() => {
    if (quest?.lock_address && serverWalletAddress) {
      checkActualManagerStatus();
    }
  }, [quest?.lock_address, serverWalletAddress, checkActualManagerStatus]);

  useEffect(() => {
    let cancelled = false;

    const checkActivationManagerStatus = async () => {
      if (
        quest?.reward_type !== "activation" ||
        quest.activation_type !== "dg_trial" ||
        !activationLockAddress ||
        !serverWalletAddress
      ) {
        setActivationManagerStatus(null);
        setActivationManagerError(null);
        return;
      }

      try {
        const isManager = await checkIsLockManager(
          serverWalletAddress as Address,
          activationLockAddress as Address,
        );
        if (!cancelled) {
          setActivationManagerStatus(isManager);
          setActivationManagerError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          log.error("Failed to check activation lock manager status:", err);
          setActivationManagerStatus(null);
          setActivationManagerError(
            err?.message || "Failed to check lock manager status",
          );
        }
      }
    };

    checkActivationManagerStatus();

    return () => {
      cancelled = true;
    };
  }, [
    quest?.reward_type,
    quest?.activation_type,
    activationLockAddress,
    serverWalletAddress,
    checkIsLockManager,
  ]);

  useEffect(() => {
    if (quest?.lock_address) {
      checkActualMaxKeysValue();
    }
  }, [quest?.lock_address, checkActualMaxKeysValue]);

  const getTaskIcon = (taskType: string) => {
    switch (taskType) {
      case "submit_url":
      case "submit_text":
      case "submit_proof":
        return "📝";
      case "link_email":
        return "📧";
      case "link_wallet":
        return "👛";
      case "link_farcaster":
        return "🔗";
      case "sign_tos":
        return "📄";
      default:
        return "✅";
    }
  };

  if (isLoadingAuth || isLoading) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-flame-yellow"></div>
        </div>
      </AdminLayout>
    );
  }

  if (error || !quest) {
    return (
      <AdminLayout>
        <QuestErrorWrapper
          error={error || "Quest not found"}
          onRetry={() => {
            if (id && typeof id === "string") fetchQuestDetails(id);
          }}
        />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/admin/quests"
            className="inline-flex items-center text-gray-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            Back to Quests
          </Link>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">
                {quest.title}
              </h1>
              <div className="flex items-center gap-3">
                <Badge
                  className={quest.is_active ? "bg-green-600" : "bg-gray-600"}
                >
                  {quest.is_active ? "Active" : "Inactive"}
                </Badge>
                {quest.stats && quest.stats.pending_submissions > 0 && (
                  <Badge className="bg-orange-600">
                    {quest.stats.pending_submissions} Pending Reviews
                  </Badge>
                )}
                <MaxKeysSecurityBadge
                  lockAddress={quest.lock_address}
                  maxKeysSecured={quest.max_keys_secured}
                  reason={quest.max_keys_failure_reason}
                />
              </div>
            </div>

            <Link href={`/admin/quests/${quest.id}/edit`}>
              <Button className="bg-steel-red hover:bg-steel-red/90">
                <Edit className="w-4 h-4 mr-2" />
                Edit Quest
              </Button>
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-6"
        >
          <TabsList className="bg-gray-900 border border-gray-800">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-gray-800"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="tasks"
              className="data-[state=active]:bg-gray-800"
            >
              Tasks ({quest.quest_tasks?.length || 0})
            </TabsTrigger>
            <TabsTrigger
              value="submissions"
              className="data-[state=active]:bg-gray-800"
            >
              Submissions
              {quest.stats && quest.stats.pending_submissions > 0 && (
                <span className="ml-2 bg-orange-600 text-white text-xs px-2 py-0.5 rounded-full">
                  {quest.stats.pending_submissions}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Quest Info */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
              <div className="flex items-start gap-6">
                {quest.image_url && (
                  <div className="w-32 h-32 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
                    <Image
                      src={quest.image_url}
                      alt={quest.title}
                      width={128}
                      height={128}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-gray-300 mb-4">{quest.description}</p>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center text-yellow-400">
                      <Coins className="w-5 h-5 mr-2" />
                      <span className="font-bold text-lg">
                        {quest.total_reward} DG Total
                      </span>
                    </div>
                    <div className="text-gray-400">
                      {quest.quest_tasks?.length || 0} tasks
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Lock Manager Status Display */}
            {quest.lock_address && serverWalletAddress && (
              <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900 p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-3">
                  Lock Manager Status
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Database Status:</span>
                    <span
                      className={`font-medium ${quest.lock_manager_granted ? "text-green-400" : "text-red-400"}`}
                    >
                      {quest.lock_manager_granted
                        ? "✅ Granted"
                        : "❌ Not Granted"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Blockchain Status:</span>
                    <span
                      className={`font-medium ${
                        actualManagerStatus === null
                          ? "text-yellow-400"
                          : actualManagerStatus
                            ? "text-green-400"
                            : "text-red-400"
                      }`}
                    >
                      {actualManagerStatus === null
                        ? "⏳ Checking..."
                        : actualManagerStatus
                          ? "✅ Is Manager"
                          : "❌ Not Manager"}
                    </span>
                  </div>
                  {actualManagerStatus !== null &&
                    quest.lock_manager_granted !== actualManagerStatus && (
                      <div className="mt-3 p-3 bg-amber-900/20 border border-amber-700 rounded">
                        <div className="flex flex-col gap-2">
                          <p className="text-amber-300 text-xs font-medium">
                            ⚠️ Status Mismatch: Database and blockchain states
                            don&apos;t match!
                          </p>
                          <SyncLockStateButton
                            entityType="quest"
                            entityId={quest.id}
                            lockAddress={quest.lock_address}
                            mode="manager"
                            onSuccess={() => {
                              if (id && typeof id === "string") {
                                fetchQuestDetails(id);
                                checkActualManagerStatus();
                                checkActualMaxKeysValue();
                              }
                            }}
                          />
                        </div>
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* Activation Lock Manager Status */}
            {quest.reward_type === "activation" &&
              quest.activation_type === "dg_trial" &&
              activationLockAddress &&
              serverWalletAddress && (
                <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900 p-4">
                  <h3 className="text-sm font-medium text-slate-300 mb-3">
                    Activation Lock Manager Status
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Server wallet</span>
                      <span className="text-slate-200">
                        {serverWalletAddress}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Lock address</span>
                      <span className="text-slate-200">
                        {activationLockAddress}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Blockchain Status:</span>
                      <span
                        className={`font-medium ${
                          activationManagerStatus === null
                            ? "text-yellow-400"
                            : activationManagerStatus
                              ? "text-green-400"
                              : "text-red-400"
                        }`}
                      >
                        {activationManagerStatus === null
                          ? "⏳ Checking..."
                          : activationManagerStatus
                            ? "✅ Is Manager"
                            : "❌ Not Manager"}
                      </span>
                    </div>
                    {activationManagerError && (
                      <p className="mt-2 text-xs text-amber-300">
                        {activationManagerError}
                      </p>
                    )}
                    {activationManagerStatus === false && (
                      <p className="mt-2 text-xs text-amber-300">
                        Granting trials will fail until the server wallet is
                        added as a lock manager.
                      </p>
                    )}
                  </div>
                </div>
              )}

            {/* Lock Manager Grant Retry Button */}
            {quest.lock_address && actualManagerStatus === false && (
              <LockManagerRetryButton
                entityType="quest"
                entityId={quest.id}
                lockAddress={quest.lock_address}
                grantFailureReason={quest.grant_failure_reason}
                onSuccess={() => {
                  toast.success("Database updated successfully");
                  if (id && typeof id === "string") {
                    fetchQuestDetails(id); // Refresh quest data
                    checkActualManagerStatus(); // Refresh blockchain status
                  }
                }}
                onError={(error) => {
                  toast.error(`Update failed: ${error}`);
                }}
              />
            )}

            {/* Purchase Security Status Display */}
            {quest.lock_address && (
              <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900 p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-3">
                  Purchase Security Status
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Database Status:</span>
                    <span
                      className={`font-medium ${quest.max_keys_secured ? "text-green-400" : "text-red-400"}`}
                    >
                      {quest.max_keys_secured ? "✅ Secured" : "❌ Not Secured"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">
                      Blockchain maxNumberOfKeys:
                    </span>
                    <span
                      className={`font-medium ${
                        actualMaxKeysValue === null
                          ? "text-yellow-400"
                          : actualMaxKeysValue === 0n
                            ? "text-green-400"
                            : "text-red-400"
                      }`}
                    >
                      {actualMaxKeysValue === null
                        ? "⏳ Checking..."
                        : actualMaxKeysValue === 0n
                          ? "✅ Purchases disabled (0)"
                          : `❌ Purchases enabled (${actualMaxKeysValue.toString()})`}
                    </span>
                  </div>
                  {actualMaxKeysValue !== null &&
                    ((quest.max_keys_secured && actualMaxKeysValue !== 0n) ||
                      (!quest.max_keys_secured &&
                        actualMaxKeysValue === 0n)) && (
                      <div className="mt-3 p-3 bg-amber-900/20 border border-amber-700 rounded">
                        <div className="flex flex-col gap-2">
                          <p className="text-amber-300 text-xs font-medium">
                            ⚠️ Status Mismatch: Database and blockchain states
                            don&apos;t match!
                          </p>
                          <SyncLockStateButton
                            entityType="quest"
                            entityId={quest.id}
                            lockAddress={quest.lock_address}
                            mode="maxKeys"
                            onSuccess={() => {
                              if (id && typeof id === "string") {
                                fetchQuestDetails(id);
                                checkActualMaxKeysValue();
                              }
                            }}
                          />
                        </div>
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* Purchase Security Button */}
            {quest.lock_address && actualMaxKeysValue !== 0n && (
              <MaxKeysSecurityButton
                entityType="quest"
                entityId={quest.id}
                lockAddress={quest.lock_address}
                maxKeysFailureReason={quest.max_keys_failure_reason}
                onSuccess={() => {
                  toast.success("Lock purchases disabled successfully");
                  if (id && typeof id === "string") {
                    fetchQuestDetails(id); // Refresh quest data
                    checkActualMaxKeysValue(); // Refresh blockchain status
                  }
                }}
                onError={(error) => {
                  toast.error(`Security update failed: ${error}`);
                }}
              />
            )}

            {/* Statistics */}
            {quest.stats && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-sm">Total Users</p>
                      <p className="text-2xl font-bold text-white">
                        {quest.stats.total_users}
                      </p>
                    </div>
                    <Users className="w-8 h-8 text-gray-600" />
                  </div>
                </div>

                <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-sm">
                        Completed Submissions
                      </p>
                      <p className="text-2xl font-bold text-green-400">
                        {quest.stats.completed_submissions}
                      </p>
                    </div>
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  </div>
                </div>

                <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-sm">Completion Rate</p>
                      <p className="text-2xl font-bold text-white">
                        {quest.stats.completion_rate}%
                      </p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center">
                      <span className="text-xs font-bold text-white">%</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-sm">Pending Reviews</p>
                      <p className="text-2xl font-bold text-orange-400">
                        {quest.stats.pending_submissions}
                      </p>
                    </div>
                    <Clock className="w-8 h-8 text-orange-600" />
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Tasks Tab */}
          <TabsContent value="tasks" className="space-y-4">
            {quest.quest_tasks && quest.quest_tasks.length > 0 ? (
              quest.quest_tasks
                .sort((a, b) => a.order_index - b.order_index)
                .map((task, index) => (
                  <div
                    key={task.id}
                    className="bg-gray-900/50 border border-gray-800 rounded-lg p-6"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-2xl">
                            {getTaskIcon(task.task_type)}
                          </span>
                          <h3 className="text-lg font-semibold text-white">
                            {index + 1}. {task.title}
                          </h3>
                          {task.requires_admin_review && (
                            <Badge className="bg-orange-600">
                              Requires Review
                            </Badge>
                          )}
                        </div>
                        <p className="text-gray-400 mb-4">{task.description}</p>

                        <div className="flex items-center gap-6 text-sm">
                          <div className="flex items-center text-yellow-400">
                            <Coins className="w-4 h-4 mr-1" />
                            <span className="font-semibold">
                              {task.reward_amount} DG
                            </span>
                          </div>
                          <div className="text-gray-400">
                            Type:{" "}
                            <span className="text-gray-300">
                              {task.task_type}
                            </span>
                          </div>
                          {task.input_required && (
                            <div className="text-gray-400">
                              Input:{" "}
                              <span className="text-gray-300">
                                {task.input_label || "Required"}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
            ) : (
              <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-8 text-center">
                <p className="text-gray-400">No tasks found for this quest</p>
              </div>
            )}
          </TabsContent>

          {/* Submissions Tab */}
          <TabsContent value="submissions">
            <QuestSubmissionsTable
              questId={quest.id}
              onStatusUpdate={() => fetchQuestDetails(quest.id)}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

/**
 * Render an error UI that shows a network error with a retry action and a "Back to Quests" button.
 *
 * Displays NetworkError with an internal retry spinner while `onRetry` is executing.
 *
 * @param error - The error message to display in the NetworkError component
 * @param onRetry - Callback invoked when the user triggers a retry; the component displays a retry state until the promise resolves
 * @returns The wrapped error UI element containing the NetworkError and a navigation button back to the quests list
 */
function QuestErrorWrapper({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  const [isRetrying, setIsRetrying] = useState(false);
  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };
  return (
    <div className="max-w-xl mx-auto py-12">
      <NetworkError
        error={error}
        onRetry={handleRetry}
        isRetrying={isRetrying}
      />
      <div className="text-center mt-4">
        <Link href="/admin/quests">
          <Button variant="outline" className="border-gray-700">
            Back to Quests
          </Button>
        </Link>
      </div>
    </div>
  );
}