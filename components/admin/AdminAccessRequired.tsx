import React, { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { UnlockPurchaseButton } from "../unlock/UnlockPurchaseButton";
import { Button } from "../ui/button";
import Link from "next/link";
import { RefreshCcw, User, Copy, LogOut, Plus, Unlink } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { lockManagerService } from "@/lib/blockchain/lock-manager";
import { type Address } from "viem";

interface AdminAccessRequiredProps {
  message?: string;
}

export default function AdminAccessRequired({
  message,
}: AdminAccessRequiredProps) {
  const { user, authenticated, login, logout, linkWallet, unlinkWallet } =
    usePrivy();
  const { refreshAdminStatus } = useAdminAuth();
  const [providerAddress, setProviderAddress] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [accessStatus, setAccessStatus] = useState<{
    hasAccess: boolean;
    expirationDate: string | null;
    isChecking: boolean;
  }>({
    hasAccess: false,
    expirationDate: null,
    isChecking: false,
  });
  const adminLockAddress = process.env.NEXT_PUBLIC_ADMIN_LOCK_ADDRESS;

  // Read the active account from window.ethereum on mount and when it changes
  useEffect(() => {
    let mounted = true;

    const getAccounts = async () => {
      if (typeof window !== "undefined" && (window as any).ethereum) {
        try {
          const accounts: string[] | undefined = await (
            window as any
          ).ethereum.request({
            method: "eth_accounts",
          });
          if (mounted) {
            const addr: string | null =
              Array.isArray(accounts) && accounts.length > 0
                ? (accounts[0] as string)
                : null;
            setProviderAddress(addr);
          }
        } catch (err) {
          console.warn("Unable to fetch accounts from provider", err);
        }
      }
    };

    getAccounts();

    if (typeof window !== "undefined" && (window as any).ethereum) {
      const handler = (accounts: string[]) => {
        const addr: string | null =
          Array.isArray(accounts) && accounts.length > 0
            ? (accounts[0] as string)
            : null;
        setProviderAddress(addr);
      };
      (window as any).ethereum.on("accountsChanged", handler);
      return () => {
        (window as any).ethereum.removeListener("accountsChanged", handler);
        mounted = false;
      };
    }

    return () => {
      mounted = false;
    };
  }, []);

  // Function to check if user has access and get expiration date
  const checkAccessStatus = useCallback(async (addr: string, forceRefresh = false) => {
    if (!addr || !adminLockAddress) return;

    setAccessStatus((prev) => ({ ...prev, isChecking: true }));

    try {
      const keyInfo = await lockManagerService.checkUserHasValidKey(
        addr as Address,
        adminLockAddress as Address,
        forceRefresh
      );

      if (keyInfo && keyInfo.isValid) {
        // Convert timestamp to readable date
        const expirationDate = new Date(
          Number(keyInfo.expirationTimestamp) * 1000
        ).toLocaleDateString();
        setAccessStatus({
          hasAccess: true,
          expirationDate,
          isChecking: false,
        });
      } else {
        setAccessStatus({
          hasAccess: false,
          expirationDate: null,
          isChecking: false,
        });
      }
    } catch (error) {
      console.error("Error checking access status:", error);
      setAccessStatus({
        hasAccess: false,
        expirationDate: null,
        isChecking: false,
      });
    }

    // No further actions here; avoid recursive calls.
  }, [adminLockAddress]);

  // Run access check whenever providerAddress changes (and is non-null)
  useEffect(() => {
    if (!providerAddress || !adminLockAddress) return;

    // Reset status while checking
    setAccessStatus({
      hasAccess: false,
      expirationDate: null,
      isChecking: true,
    });

    checkAccessStatus(providerAddress, true);
  }, [providerAddress, adminLockAddress, checkAccessStatus]);

  // Handler for refreshing wallet status
  const handleRefreshStatus = async () => {
    setIsRefreshing(true);
    try {
      // First refresh the wallet connection through Privy
      await login();

      // Then manually check admin access status
      await refreshAdminStatus();

      // Also update the local access status display
      if (providerAddress) {
        await checkAccessStatus(providerAddress, true);
      }

      // Add a small delay to ensure UI updates are visible
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error("Error refreshing user status:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Get wallet information if available
  const walletAddress = providerAddress || null;
  const shortAddress = walletAddress
    ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(
        walletAddress.length - 4
      )}`
    : "No wallet";

  const numAccounts = user?.linkedAccounts?.length || 0;
  const canRemoveAccount = numAccounts > 1;

  // Copy wallet address to clipboard
  const copyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Handle linking a new wallet
  const handleLinkWallet = async () => {
    try {
      await linkWallet();
    } catch (error) {
      console.error("Failed to link wallet:", error);
    }
  };

  // Handle unlinking the current wallet
  const handleUnlinkWallet = async () => {
    if (walletAddress) {
      try {
        await unlinkWallet(walletAddress);
      } catch (error) {
        console.error("Failed to unlink wallet:", error);
      }
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8 p-6 bg-gray-900 rounded-lg border border-gray-800">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-white">
            Admin Access Required
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            {message || "You need admin access to view this page"}
          </p>
        </div>

        <div className="mt-8 space-y-6">
          {!authenticated ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Please connect your wallet first
              </p>
              <Button onClick={login} className="w-full">
                Connect Wallet
              </Button>
            </div>
          ) : !user?.wallet ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Please connect a wallet to continue
              </p>
              <Button onClick={login} className="w-full">
                Connect Wallet
              </Button>
            </div>
          ) : (
            <>
              {/* Wallet Card */}
              <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center mr-3">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium">Connected Wallet</h3>
                      <p className="text-xs text-gray-400">{shortAddress}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={copyAddress}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    <span className="text-xs">
                      {copied ? "Copied!" : "Copy"}
                    </span>
                  </Button>
                </div>

                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full flex items-center justify-center"
                    onClick={handleRefreshStatus}
                    disabled={isRefreshing || accessStatus.isChecking}
                  >
                    <RefreshCcw
                      className={`h-4 w-4 mr-2 ${
                        isRefreshing || accessStatus.isChecking
                          ? "animate-spin"
                          : ""
                      }`}
                    />
                    <span>
                      {isRefreshing
                        ? "Refreshing..."
                        : accessStatus.isChecking
                        ? "Checking access..."
                        : "Refresh Connection"}
                    </span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full flex items-center justify-center"
                    onClick={handleLinkWallet}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    <span>Connect Different Wallet</span>
                  </Button>

                  {walletAddress && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full flex items-center justify-center"
                      onClick={handleUnlinkWallet}
                      disabled={!canRemoveAccount}
                    >
                      <Unlink className="h-4 w-4 mr-2" />
                      <span>Unlink Current Wallet</span>
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full flex items-center justify-center"
                    onClick={logout}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    <span>Log Out</span>
                  </Button>
                </div>
              </div>

              {/* Access Status */}
              {accessStatus.isChecking ? (
                <div className="bg-gray-800 p-3 rounded-md border border-gray-700 text-center">
                  <p className="text-sm text-gray-300">
                    Checking access status...
                  </p>
                </div>
              ) : accessStatus.hasAccess ? (
                <div className="bg-green-900/30 p-3 rounded-md border border-green-800 text-center">
                  <p className="text-sm text-green-300">
                    You have admin access until {accessStatus.expirationDate}
                  </p>
                  <p className="text-xs text-green-400 mt-1">
                    Please refresh the page to continue
                  </p>
                </div>
              ) : /* Admin Access Information */
              adminLockAddress ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-400">
                    You need a key for the admin lock to access this area
                  </p>
                  <UnlockPurchaseButton
                    lockAddress={adminLockAddress}
                    className="w-full bg-steel-red hover:bg-steel-red/90"
                  >
                    Purchase Admin Access
                  </UnlockPurchaseButton>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-gray-400">
                    Admin lock address not configured. Please contact the
                    administrator.
                  </p>
                  <Link href="/">
                    <Button variant="outline" className="w-full">
                      Return to Homepage
                    </Button>
                  </Link>
                </div>
              )}
            </>
          )}

          <div className="text-xs text-gray-500 text-center mt-4">
            <p>
              Already have an admin key? Make sure your wallet is connected with
              the correct account. You can connect a different wallet or try
              refreshing your connection.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
