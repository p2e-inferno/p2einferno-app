import { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { User, Mail, Wallet, Share2, Plus } from "lucide-react";
import { toast } from "react-hot-toast";

import { LobbyLayout } from "@/components/layouts/lobby-layout";
import {
  ProfileHeader,
  LinkedAccountsSection,
  CompletionCallToAction,
  type LinkedAccount,
  type ProfileStats,
} from "@/components/profile";
import { useDashboardData } from "@/hooks/useDashboardData";
import { getLogger } from "@/lib/utils/logger";
import { WithdrawDGButton } from "@/components/token-withdrawal/WithdrawDGButton";
import { WithdrawalHistoryTable } from "@/components/token-withdrawal/WithdrawalHistoryTable";
import { SubscriptionBadge } from "@/components/token-withdrawal/SubscriptionBadge";
import { AccessRequirementCard } from "@/components/token-withdrawal/AccessRequirementCard";
import { SubscriptionStatusCard } from "@/components/subscription";
import { useWithdrawalLimits } from "@/hooks/useWithdrawalLimits";
import ConfirmationDialog from "@/components/ui/confirmation-dialog";
import { useAddDGTokenToWallet } from "@/hooks/useAddDGTokenToWallet";

const log = getLogger("lobby:profile:index");

/**
 * ProfilePage - Main profile management page for users
 * Displays user information, linked accounts, and completion status
 */
const ProfilePage = () => {
  const {
    user,
    linkEmail,
    unlinkEmail,
    linkFarcaster,
    unlinkFarcaster,
    unlinkWallet,
  } = usePrivy();
  const {
    data: dashboardData,
    loading: dashboardLoading,
    refetch,
  } = useDashboardData();

  // Fetch withdrawal limits once at the page level (React Query will cache and deduplicate)
  const withdrawalLimits = useWithdrawalLimits();
  const {
    addToken: addDGToken,
    isAvailable: isAddDGAvailable,
    isLoading: isAddDGLoading,
  } = useAddDGTokenToWallet();

  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [linking, setLinking] = useState<string | null>(null);
  const [unlinkWalletModal, setUnlinkWalletModal] = useState<{
    open: boolean;
    address: string | null;
  }>({ open: false, address: null });

  /**
   * Updates the linked accounts array based on current user data
   */
  const updateLinkedAccounts = useCallback(() => {
    if (!user) return;

    const accounts: LinkedAccount[] = [
      {
        type: "wallet",
        linked: !!user.wallet,
        address: user.wallet?.address,
        icon: <Wallet className="w-6 h-6" />,
        name: "Web3 Wallet",
        description: "Your gateway to the decentralized world",
      },
      {
        type: "email",
        linked: !!user.email,
        address: user.email?.address,
        icon: <Mail className="w-6 h-6" />,
        name: "Email Address",
        description: "For important notifications and recovery",
      },
      {
        type: "farcaster",
        linked: !!user.farcaster,
        username: user.farcaster?.username || undefined,
        icon: <Share2 className="w-6 h-6" />,
        name: "Farcaster Account",
        description: "Connect with the Web3 social community",
      },
    ];

    setLinkedAccounts(accounts);
  }, [user]);

  // Update linked accounts when user data changes
  useEffect(() => {
    if (user) {
      updateLinkedAccounts();
    }
  }, [user, user?.email, user?.farcaster, user?.wallet, updateLinkedAccounts]);

  /**
   * Handles linking of accounts through Privy
   */
  const handleLinkAccount = async (type: string) => {
    setLinking(type);

    try {
      switch (type) {
        case "email":
          await linkEmail();
          break;
        case "farcaster":
          await linkFarcaster();
          break;
        default:
          toast.error("Cannot link this account type");
      }
      refetch(); // Refresh dashboard data after linking
    } catch (error) {
      log.error("Error linking account:", error);
      toast.error("Failed to initiate account linking");
    } finally {
      setLinking(null);
    }
  };

  /**
   * Handles unlinking of accounts through Privy.
   * Wallet unlinking is deferred to a confirmation modal.
   */
  const handleUnlinkAccount = async (type: string, address?: string) => {
    if (!address) return;

    if (type === "wallet") {
      const numAccounts = user?.linkedAccounts?.length ?? 0;
      if (numAccounts <= 1) {
        toast.error("Cannot unlink your only account");
        return;
      }
      setUnlinkWalletModal({ open: true, address });
      return;
    }

    try {
      switch (type) {
        case "email":
          await unlinkEmail(address);
          toast.success("Email unlinked successfully");
          break;
        case "farcaster":
          if (user?.farcaster?.fid) {
            await unlinkFarcaster(user.farcaster.fid);
            toast.success("Farcaster unlinked successfully");
          }
          break;
        default:
          toast.error("Cannot unlink this account type");
      }
      refetch();
    } catch (error) {
      log.error("Error unlinking account:", error);
      toast.error("Failed to unlink account");
    }
  };

  /**
   * Runs after the user confirms wallet unlink in the modal.
   */
  const handleConfirmUnlinkWallet = async () => {
    if (!unlinkWalletModal.address) return;

    try {
      await unlinkWallet(unlinkWalletModal.address);
      toast.success("Wallet unlinked successfully");
      refetch();
    } catch (error) {
      log.error("Error unlinking wallet:", error);
      toast.error("Failed to unlink wallet");
    } finally {
      setUnlinkWalletModal({ open: false, address: null });
    }
  };

  // Early return for unauthenticated users
  if (!user) {
    return (
      <LobbyLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <User className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <p className="text-xl text-gray-400">
              Please connect your wallet to view your profile
            </p>
          </div>
        </div>
      </LobbyLayout>
    );
  }

  // Loading state while dashboard data is being fetched
  if (dashboardLoading || !dashboardData) {
    return (
      <LobbyLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin"></div>
        </div>
      </LobbyLayout>
    );
  }

  // Calculate profile stats using live data
  const linkedCount = linkedAccounts.filter((acc) => acc.linked).length;
  const completionPercentage = Math.round(
    (linkedCount / linkedAccounts.length) * 100,
  );

  const profileStats: ProfileStats = {
    questsCompleted: dashboardData.stats.questsCompleted,
    dgEarned: dashboardData.profile.experience_points,
    accountsLinked: linkedCount,
    totalAccounts: linkedAccounts.length,
  };

  return (
    <LobbyLayout>
      <div className="min-h-screen p-4 sm:p-8">
        <div className="max-w-4xl mx-auto">
          <ProfileHeader
            userAddress={user.wallet?.address}
            completionPercentage={completionPercentage}
            profileStats={profileStats}
          />

          <LinkedAccountsSection
            accounts={linkedAccounts}
            linking={linking}
            onLinkAccount={handleLinkAccount}
            onUnlinkAccount={handleUnlinkAccount}
          />

          <CompletionCallToAction completionPercentage={completionPercentage} />

          <ConfirmationDialog
            isOpen={unlinkWalletModal.open}
            onClose={() => setUnlinkWalletModal({ open: false, address: null })}
            onConfirm={handleConfirmUnlinkWallet}
            title="Unlink wallet?"
            description="If this wallet was used to complete quests or hold NFTs tied to those quests, unlinking it may cause you to lose access to those quests or their benefits."
            confirmText="Unlink wallet"
            variant="danger"
          />

          {/* DG Nation Subscription Management Section */}
          <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl border border-gray-700 p-6 sm:p-8 mt-6">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">
              Subscription Management
            </h2>
            <SubscriptionStatusCard
              onRenewalComplete={() => refetch()}
              className="mt-0"
            />
          </div>

          {/* DG Token Withdrawal Section */}
          <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl border border-gray-700/50 p-6 sm:p-10 mt-8 shadow-2xl relative overflow-hidden group">
            {/* Background Accent */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 blur-[100px] rounded-full group-hover:bg-indigo-500/15 transition-colors duration-500" />

            <div className="relative">
              <div className="mb-6">
                <SubscriptionBadge />
              </div>

              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
                <div className="max-w-xl">
                  <h2 className="text-2xl sm:text-3xl font-black text-white mb-3 tracking-tight">
                    Withdraw{" "}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-indigo-300">
                      DG Tokens
                    </span>
                  </h2>
                  <p className="text-gray-400 text-base leading-relaxed">
                    Pull out your earned DG tokens to your wallet
                  </p>
                </div>

                {isAddDGAvailable && (
                  <button
                    onClick={addDGToken}
                    disabled={isAddDGLoading}
                    className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm font-bold hover:bg-orange-500/20 hover:border-orange-500/30 transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    Add DG to Wallet
                  </button>
                )}
              </div>

              {/* Show purchase card if user doesn't have DG Nation membership */}
              <div className="mb-8">
                <AccessRequirementCard />
              </div>

              <div className="grid grid-cols-1 gap-6">
                <WithdrawDGButton limits={withdrawalLimits} />
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                Pullout History
              </h3>
              <WithdrawalHistoryTable />
            </div>
          </div>
        </div>
      </div>
    </LobbyLayout>
  );
};

export default ProfilePage;
