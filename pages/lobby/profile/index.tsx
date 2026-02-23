import { useState, useEffect, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { User, Mail, Wallet, Share2, MessageCircle, Plus } from "lucide-react";
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
import { isEmbeddedWallet } from "@/lib/utils/wallet-address";
import { selectLinkedWallet } from "@/lib/utils/wallet-selection";
import { WithdrawDGButton } from "@/components/token-withdrawal/WithdrawDGButton";
import { WithdrawalHistoryTable } from "@/components/token-withdrawal/WithdrawalHistoryTable";
import { SubscriptionBadge } from "@/components/token-withdrawal/SubscriptionBadge";
import { AccessRequirementCard } from "@/components/token-withdrawal/AccessRequirementCard";
import { SubscriptionStatusCard } from "@/components/subscription";
import { useWithdrawalLimits } from "@/hooks/useWithdrawalLimits";
import ConfirmationDialog from "@/components/ui/confirmation-dialog";
import { useAddDGTokenToWallet } from "@/hooks/useAddDGTokenToWallet";
import { useTelegramNotifications } from "@/hooks/useTelegramNotifications";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const log = getLogger("lobby:profile:index");

/**
 * Extract a user-facing error message from a Privy (or generic) error.
 */
function extractErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    // Check for error.error (Privy API error format)
    if (
      "error" in error &&
      typeof (error as Record<string, unknown>).error === "string"
    ) {
      return (error as Record<string, unknown>).error as string;
    }
    // Fallback to error.message (standard Error format)
    if (
      "message" in error &&
      typeof (error as Record<string, unknown>).message === "string"
    ) {
      return (error as Record<string, unknown>).message as string;
    }
  }
  return fallback;
}

/**
 * ProfilePage - Main profile management page for users
 * Displays user information, linked accounts, and completion status
 */
const ProfilePage = () => {
  const {
    user,
    linkEmail,
    unlinkEmail,
    linkWallet,
    linkFarcaster,
    unlinkFarcaster,
    unlinkWallet,
  } = usePrivy();
  const { wallets } = useWallets();
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
  const telegram = useTelegramNotifications();

  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [linking, setLinking] = useState<string | null>(null);
  const [unlinkWalletModal, setUnlinkWalletModal] = useState<{
    open: boolean;
    address: string | null;
  }>({ open: false, address: null });

  /**
   * Updates the linked accounts array based on current user data.
   * Uses device-aware wallet selection to determine which wallet is active and available.
   * Shows all linked wallets with availability status.
   */
  const updateLinkedAccounts = useCallback(() => {
    if (!user) return;

    // Use device-aware wallet selection to determine the active wallet
    const activeWallet = selectLinkedWallet(user, wallets);

    // Get all wallet accounts from user.linkedAccounts
    const allWalletAccounts = user.linkedAccounts.filter(
      (account) => account.type === "wallet",
    ) as Array<{
      address?: string;
      walletClientType?: string;
      connectorType?: string;
    }>;

    let walletAccounts: LinkedAccount[] = [];

    if (allWalletAccounts.length > 0) {
      // Process each wallet to determine availability
      walletAccounts = allWalletAccounts.map((wallet) => {
        const embedded = isEmbeddedWallet(wallet.walletClientType);

        // Check if this wallet is available on the current device
        // Embedded wallets are always available, external wallets must be in the wallets array
        const isAvailable =
          embedded ||
          wallets.some(
            (w) => w.address?.toLowerCase() === wallet.address?.toLowerCase(),
          );

        // Check if this is the active wallet
        const isActive =
          activeWallet?.address?.toLowerCase() ===
          wallet.address?.toLowerCase();

        return {
          type: "wallet",
          linked: true,
          address: wallet.address,
          walletClientType: wallet.walletClientType,
          isEmbedded: embedded,
          isAvailable,
          isActive,
          icon: <Wallet className="w-6 h-6" />,
          name: embedded ? "Embedded Wallet" : "Web3 Wallet",
          description: embedded
            ? "Managed by Privy — cannot be unlinked"
            : "Your gateway to the decentralized world",
        };
      });
    } else {
      // No wallet linked yet
      walletAccounts = [
        {
          type: "wallet",
          linked: false,
          icon: <Wallet className="w-6 h-6" />,
          name: "Web3 Wallet",
          description: "Your gateway to the decentralized world",
        },
      ];
    }

    const accounts: LinkedAccount[] = [
      ...walletAccounts,
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
      {
        type: "telegram",
        linked: telegram.enabled,
        icon: <MessageCircle className="w-6 h-6" />,
        name: "Telegram Notifications",
        description: "Get instant quest updates via Telegram",
      },
    ];

    setLinkedAccounts(accounts);
  }, [user, wallets, telegram.enabled]);

  // Update linked accounts when user data or available wallets change
  // updateLinkedAccounts already depends on [user, wallets], so we only need it in deps
  useEffect(() => {
    if (user) {
      updateLinkedAccounts();
    }
  }, [user, updateLinkedAccounts]);

  /**
   * Handles linking of accounts through Privy
   * For wallets, Privy will automatically update user.linkedAccounts when linking completes,
   * triggering the useEffect that calls updateLinkedAccounts()
   */
  const handleLinkAccount = async (type: string) => {
    setLinking(type);

    try {
      switch (type) {
        case "wallet":
          // linkWallet() opens modal and returns immediately (void)
          // Privy will update user.linkedAccounts when modal completes
          // Our useEffect watching [user, wallets] will handle the refresh
          linkWallet();
          // Clear linking state after a delay since we can't detect modal close
          setTimeout(() => setLinking(null), 3000);
          break;
        case "email":
          // linkEmail() also returns void immediately
          linkEmail();
          // Privy updates user.email when complete, triggering useEffect
          setTimeout(() => setLinking(null), 2000);
          break;
        case "farcaster":
          // linkFarcaster() also returns void immediately
          linkFarcaster();
          // Privy updates user.farcaster when complete, triggering useEffect
          setTimeout(() => setLinking(null), 2000);
          break;
        case "telegram":
          // Hook manages its own linking state internally via polling;
          // clear parent state so the ternary falls through to hook state.
          await telegram.enable();
          setLinking(null);
          break;
        default:
          toast.error("Cannot link this account type");
          setLinking(null);
      }
    } catch (error) {
      log.error("Error linking account:", error);
      toast.error("Failed to initiate account linking");
      setLinking(null);
    }
  };

  /**
   * Handles unlinking of accounts through Privy.
   * Wallet unlinking is deferred to a confirmation modal.
   */
  const handleUnlinkAccount = async (type: string, address?: string) => {
    if (type === "wallet") {
      if (!address) return;
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
          if (!address) return;
          await unlinkEmail(address);
          toast.success("Email unlinked successfully");
          break;
        case "farcaster":
          if (user?.farcaster?.fid) {
            await unlinkFarcaster(user.farcaster.fid);
            toast.success("Farcaster unlinked successfully");
          }
          break;
        case "telegram":
          await telegram.disable();
          break;
        default:
          toast.error("Cannot unlink this account type");
      }
      refetch();
    } catch (error) {
      log.error("Error unlinking account:", error);
      toast.error(extractErrorMessage(error, "Failed to unlink account"));
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
      toast.error(extractErrorMessage(error, "Failed to unlink wallet"));
    } finally {
      setUnlinkWalletModal({ open: false, address: null });
    }
  };

  const handleCopyTelegramLink = useCallback(async () => {
    if (!telegram.blockedDeepLink) return;
    try {
      await navigator.clipboard.writeText(telegram.blockedDeepLink);
      toast.success("Telegram link copied");
    } catch (error) {
      log.error("Failed to copy Telegram deep link", { error });
      toast.error("Failed to copy link. Please copy it manually.");
    }
  }, [telegram.blockedDeepLink]);

  const handleOpenTelegramLink = useCallback(() => {
    if (!telegram.blockedDeepLink) return;

    const popup = window.open("", "_blank");

    if (popup) {
      try {
        popup.opener = null;
      } catch {
        // Ignore browser restrictions on opener assignment.
      }
      popup.location.href = telegram.blockedDeepLink;
      telegram.dismissBlockedDeepLink();
    } else {
      toast("Popup still blocked. Copy the link and open it manually.");
    }
  }, [telegram]);

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

  // Calculate profile stats by category so multiple wallets don't skew the percentage
  const categories = ["wallet", "email", "farcaster"];
  const linkedCategories = categories.filter((cat) =>
    linkedAccounts.some((acc) => acc.type === cat && acc.linked),
  ).length;
  const completionPercentage = Math.round(
    (linkedCategories / categories.length) * 100,
  );

  const profileStats: ProfileStats = {
    questsCompleted: dashboardData.stats.questsCompleted,
    dgEarned: dashboardData.profile.experience_points,
    accountsLinked: linkedCategories,
    totalAccounts: categories.length,
  };

  // Get active wallet address using device-aware selection (same as dropdown/cards)
  const activeWallet = selectLinkedWallet(user, wallets);
  const displayAddress = activeWallet?.address || user.wallet?.address;

  return (
    <LobbyLayout>
      <div className="min-h-screen p-4 sm:p-8">
        <div className="max-w-4xl mx-auto">
          <ProfileHeader
            userAddress={displayAddress}
            completionPercentage={completionPercentage}
            profileStats={profileStats}
          />

          <LinkedAccountsSection
            accounts={linkedAccounts}
            linking={telegram.linking ? "telegram" : linking}
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

          <Dialog
            open={Boolean(telegram.blockedDeepLink)}
            onOpenChange={(open) => {
              if (!open) telegram.dismissBlockedDeepLink();
            }}
          >
            <DialogContent className="bg-gray-900 border border-gray-700 text-white max-w-lg">
              <DialogHeader>
                <DialogTitle>Open Telegram Manually</DialogTitle>
                <DialogDescription className="text-gray-300">
                  If Telegram did not open automatically, copy this link and
                  open it in another browser tab to complete linking.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 rounded-lg border border-gray-700 bg-gray-800/70 p-3">
                <p className="break-all text-sm text-gray-200">
                  {telegram.blockedDeepLink}
                </p>
              </div>

              <DialogFooter className="mt-6 gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  onClick={handleCopyTelegramLink}
                  className="border-gray-600 text-gray-200 hover:bg-gray-800"
                >
                  Copy Link
                </Button>
                <Button onClick={handleOpenTelegramLink} className="bg-blue-600 hover:bg-blue-700 text-white">
                  Try Opening Again
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
