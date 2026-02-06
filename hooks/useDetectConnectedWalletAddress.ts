import { useMemo } from "react";
import { type User, useWallets } from "@privy-io/react-auth";
import { getLogger } from "@/lib/utils/logger";
import { selectLinkedWallet } from "@/lib/utils/wallet-selection";

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
 *
 * Note: Fallback notifications are handled by useSmartWalletSelection to avoid duplicates.
 */
export function useDetectConnectedWalletAddress(user?: User | null) {
  const { wallets } = useWallets();

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

  return {
    walletAddress,
    connectedAddress: walletAddress, // Deprecated: kept for backward compatibility
  };
}
