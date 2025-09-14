import React, { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  CustomDropdown,
  CustomDropdownItem,
  CustomDropdownLabel,
  CustomDropdownSeparator,
} from "./CustomDropdown";
import { WalletDetailsModal } from "./WalletDetailsModal";
import { useWalletBalances } from "@/hooks/useWalletBalances";
import { useDetectConnectedWalletAddress } from "@/hooks/useDetectConnectedWalletAddress";
import { formatWalletAddress } from "@/lib/utils/wallet-address";
import { getLogger } from "@/lib/utils/logger";
import {
  User,
  LogOut,
  Copy,
  Mail,
  ExternalLink,
  Plus,
  Unlink,
  RefreshCcw,
  Eye,
} from "lucide-react";

const log = getLogger("PrivyConnectButton");

const Avatar = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={`relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full items-center justify-center bg-muted ${className}`}
  >
    {children}
  </div>
);

export function PrivyConnectButton() {
  const {
    user,
    logout,
    linkEmail,
    linkFarcaster,
    unlinkWallet,
    linkWallet,
    login,
  } = usePrivy();
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Use the consistent wallet address detection hook
  const { walletAddress } = useDetectConnectedWalletAddress(user);

  // Use the wallet balances hook
  const { balances, loading: balancesLoading } = useWalletBalances({
    enabled: isMenuOpen || showWalletModal,
  });

  // Format the wallet address consistently
  const shortAddress = formatWalletAddress(walletAddress);

  const handleViewWalletDetails = () => {
    setShowWalletModal(true);
  };

  if (!user) return null;

  const numAccounts = user.linkedAccounts?.length ?? 0;
  const canRemoveAccount = numAccounts > 1;

  const copyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLinkWallet = async () => {
    try {
      await linkWallet();
    } catch (error) {
      log.error("Failed to link wallet:", error);
    }
  };

  const handleUnlinkWallet = async () => {
    if (walletAddress) {
      try {
        await unlinkWallet(walletAddress);
      } catch (error) {
        log.error("Failed to unlink wallet:", error);
      }
    }
  };

  const handleRefreshConnection = async () => {
    setIsRefreshing(true);
    try {
      // Re-login to refresh the wallet connection
      await login();
    } catch (error) {
      log.error("Failed to refresh user:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const trigger = (
    <div className="relative h-10 w-auto pl-2 pr-4 rounded-full flex items-center space-x-2 hover:bg-accent transition-colors">
      <Avatar>
        <User className="h-5 w-5 text-faded-grey" />
      </Avatar>
      <span className="text-sm font-medium">{shortAddress}</span>
    </div>
  );

  return (
    <>
      <CustomDropdown trigger={trigger} align="end" onOpenChange={setIsMenuOpen}>
        <CustomDropdownLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">My Wallet</p>
            <p className="text-xs leading-none text-muted-foreground">
              {shortAddress}
            </p>
          </div>
        </CustomDropdownLabel>

        {/* Balance Display */}
        {walletAddress && (
          <div className="px-4 py-2 border-b border-border/50">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ETH:</span>
                <span className="font-medium">
                  {balancesLoading ? (
                    <div className="w-12 h-3 bg-muted animate-pulse rounded" />
                  ) : (
                    balances.eth.formatted
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {balances.usdc.symbol}:
                </span>
                <span className="font-medium">
                  {balancesLoading ? (
                    <div className="w-12 h-3 bg-muted animate-pulse rounded" />
                  ) : (
                    balances.usdc.formatted
                  )}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Wallet Details */}
        {walletAddress && (
          <CustomDropdownItem onClick={handleViewWalletDetails}>
            <Eye className="mr-2 h-4 w-4" />
            <span>View Wallet Details</span>
          </CustomDropdownItem>
        )}
        <CustomDropdownItem onClick={copyAddress}>
          <Copy className="mr-2 h-4 w-4" />
          <span>{copied ? "Copied!" : "Copy Address"}</span>
        </CustomDropdownItem>
        <CustomDropdownItem
          onClick={handleRefreshConnection}
          disabled={isRefreshing}
        >
          <RefreshCcw
            className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
          <span>{isRefreshing ? "Refreshing..." : "Refresh Connection"}</span>
        </CustomDropdownItem>
        <CustomDropdownSeparator />

        {/* Wallet Management Section */}
        <CustomDropdownItem onClick={handleLinkWallet}>
          <Plus className="mr-2 h-4 w-4" />
          <span>Link New Wallet</span>
        </CustomDropdownItem>

        {walletAddress && (
          <CustomDropdownItem
            onClick={handleUnlinkWallet}
            disabled={!canRemoveAccount}
          >
            <Unlink className="mr-2 h-4 w-4" />
            <span>Unlink Wallet</span>
          </CustomDropdownItem>
        )}

        <CustomDropdownSeparator />

        {/* Account Linking Section */}
        {!user.email && (
          <CustomDropdownItem onClick={linkEmail}>
            <Mail className="mr-2 h-4 w-4" />
            <span>Link Email</span>
          </CustomDropdownItem>
        )}
        {!user.farcaster && (
          <CustomDropdownItem onClick={linkFarcaster}>
            <ExternalLink className="mr-2 h-4 w-4" />
            <span>Link Farcaster</span>
          </CustomDropdownItem>
        )}
        <CustomDropdownSeparator />
        <CustomDropdownItem onClick={logout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </CustomDropdownItem>
      </CustomDropdown>

      {/* Wallet Details Modal */}
      {walletAddress && (
        <WalletDetailsModal
          isOpen={showWalletModal}
          onClose={() => setShowWalletModal(false)}
          walletAddress={walletAddress}
        />
      )}
    </>
  );
}
