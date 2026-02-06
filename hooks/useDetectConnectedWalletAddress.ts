import { useMemo, useEffect, useRef } from "react";
import { type User, useWallets } from "@privy-io/react-auth";
import { getLogger } from "@/lib/utils/logger";
import { selectLinkedWallet } from "@/lib/utils/wallet-selection";
import { isExternalWallet } from "@/lib/utils/wallet-address";
import toast from "react-hot-toast";

const log = getLogger("hooks:detect-connected-wallet-address");

/**
 * Hook that provides consistent wallet address detection across all components.
 *
 * Uses the same prioritization logic as useSmartWalletSelection:
 * 1. External wallet that is BOTH linked AND available on current device
 * 2. Any linked wallet from user.linkedAccounts (embedded wallet)
 * 3. null if no wallet available
 *
 * This ensures all components use only wallets that are actually linked to the user's
 * Privy account, preventing security issues from unlinked browser wallets.
 *
 * Device-aware: On mobile without MetaMask, this will automatically fall back to
 * embedded wallet instead of trying to use unavailable MetaMask.
 */
export function useDetectConnectedWalletAddress(user?: User | null) {
  const { wallets } = useWallets();
  const hasShownFallbackToast = useRef(false);

  const walletAddress = useMemo(() => {
    const linkedWallet = selectLinkedWallet(user, wallets);

    if (!linkedWallet) {
      log.debug("No wallet found in linked accounts");
      return null;
    }

    const isExternal = linkedWallet.walletClientType
      ? linkedWallet.walletClientType !== "privy" &&
        linkedWallet.walletClientType !== "privy-v2"
      : false;

    log.debug(
      `Found ${isExternal ? "external" : "embedded"} wallet from linked accounts`,
      {
        address: linkedWallet.address,
      }
    );

    return linkedWallet.address;
  }, [user, wallets]);

  // Detect when we fell back from external to embedded wallet
  useEffect(() => {
    if (!user?.linkedAccounts || !walletAddress) return;

    // Check if user has any linked external wallets
    const linkedExternalWallets = user.linkedAccounts.filter(
      (account) =>
        account.type === "wallet" && isExternalWallet((account as any).walletClientType)
    );

    // Get the selected wallet info to check if it's embedded
    const selectedWallet = selectLinkedWallet(user, wallets);
    const selectedIsEmbedded = selectedWallet
      ? !isExternalWallet(selectedWallet.walletClientType)
      : false;

    // If we have linked external wallets but selected an embedded one, we fell back
    if (
      linkedExternalWallets.length > 0 &&
      selectedIsEmbedded &&
      !hasShownFallbackToast.current
    ) {
      hasShownFallbackToast.current = true;

      toast.success(
        "Using embedded wallet — your external wallet is not available on this device",
        {
          duration: 10000,
          icon: "ℹ️",
          style: {
            cursor: "pointer",
          },
        }
      );

      log.info("Showed fallback notification", {
        linkedExternalCount: linkedExternalWallets.length,
        selectedWallet: walletAddress,
      });
    }

    // Reset the flag if external wallet becomes available again
    if (linkedExternalWallets.length > 0 && !selectedIsEmbedded) {
      hasShownFallbackToast.current = false;
    }
  }, [user, wallets, walletAddress]);

  return {
    walletAddress,
    connectedAddress: walletAddress, // Deprecated: kept for backward compatibility
  };
}
