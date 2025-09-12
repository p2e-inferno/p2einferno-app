import { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { User, Mail, Wallet, Share2 } from "lucide-react";
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

const log = getLogger("lobby:profile:index");

/**
 * ProfilePage - Main profile management page for users
 * Displays user information, linked accounts, and completion status
 */
const ProfilePage = () => {
  const { user, linkEmail, unlinkEmail, linkFarcaster, unlinkFarcaster } =
    usePrivy();
  const {
    data: dashboardData,
    loading: dashboardLoading,
    refetch,
  } = useDashboardData();

  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [linking, setLinking] = useState<string | null>(null);

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
   * Handles unlinking of accounts through Privy
   */
  const handleUnlinkAccount = async (type: string, address?: string) => {
    if (!address) return;

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
      refetch(); // Refresh dashboard data after unlinking
    } catch (error) {
      log.error("Error unlinking account:", error);
      toast.error("Failed to unlink account");
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
      <div className="min-h-screen p-8">
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
        </div>
      </div>
    </LobbyLayout>
  );
};

export default ProfilePage;
