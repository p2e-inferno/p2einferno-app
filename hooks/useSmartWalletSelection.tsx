import { useMemo, useEffect } from "react";
import { useWallets, useUser, usePrivy } from "@privy-io/react-auth";
import { getLogger } from "@/lib/utils/logger";
import { selectLinkedWallet } from "@/lib/utils/wallet-selection";
import { isExternalWallet } from "@/lib/utils/wallet-address";
import toast from "react-hot-toast";
import { CHAIN_ID } from "@/lib/blockchain/config";
import { WalletFallbackToast } from "@/components/ui/wallet-fallback-toast";

const log = getLogger("client:smart-wallet");

// Shared state across all hook instances to prevent duplicate toasts
const fallbackToastState = {
  hasShown: false,
  toastId: null as string | null,
};

/**
 * Smart wallet selection hook that prioritizes external wallets over embedded ones
 * Returns the best available wallet for blockchain operations
 * Prioritizes wallets from user.linkedAccounts to avoid showing unlinked browser wallets
 */
export const useSmartWalletSelection = () => {
  const { wallets } = useWallets();
  const { user } = useUser();
  const { ready } = usePrivy();

  const selectedWallet = useMemo(() => {
    log.debug("Available wallets", { wallets });
    log.debug("User linked accounts", { linkedAccounts: user?.linkedAccounts });

    // Priority 1 & 2: Select from linked accounts with device availability check
    const linkedWallet = selectLinkedWallet(user, wallets);
    if (linkedWallet) {
      const isExternal = isExternalWallet(linkedWallet.walletClientType);

      log.info(
        `✅ Found ${isExternal ? "external" : "embedded"} wallet from linked accounts`,
        { linkedWallet }
      );

      return {
        address: linkedWallet.address,
        walletClientType: linkedWallet.walletClientType || "privy",
        connectorType: linkedWallet.connectorType || (isExternal ? "injected" : "embedded"),
        type: "ethereum" as const,
        chainId: `eip155:${CHAIN_ID}`,
      };
    }

    // Priority 3: Fallback to useWallets (should rarely happen - means no linked accounts)
    if (wallets.length > 0) {
      log.warn(
        "⚠️ Falling back to browser wallet (not in linked accounts)",
        {
          wallet: wallets[0],
        }
      );
      return wallets[0];
    }

    log.info("❌ No wallets available");
    return null;
  }, [wallets, user]);

  // Detect when we fell back from external to embedded wallet
  useEffect(() => {
    // Don't evaluate until wallets array has been populated (prevents false positives during init)
    if (wallets.length === 0) return;
    if (!ready) return;
    if (!user?.linkedAccounts || !selectedWallet) return;

    // Check if user has any linked external wallets
    const linkedExternalWallets = user.linkedAccounts.filter((account) => {
      if (account.type !== "wallet") return false;
      const walletAccount = account as { walletClientType?: string };
      return isExternalWallet(walletAccount.walletClientType);
    });

    // Check if selected wallet is embedded
    const selectedIsEmbedded = !isExternalWallet(selectedWallet.walletClientType);

    // If we have linked external wallets but selected an embedded one, we fell back
    if (
      linkedExternalWallets.length > 0 &&
      selectedIsEmbedded &&
      !fallbackToastState.hasShown
    ) {
      fallbackToastState.hasShown = true;

      fallbackToastState.toastId = toast.custom(
        (t) => <WalletFallbackToast toastId={t.id} />,
        {
          duration: 10000,
        }
      );

      log.info("Showed fallback notification (shared state)", {
        linkedExternalCount: linkedExternalWallets.length,
        selectedWallet: selectedWallet.address,
      });
    }

    // Reset the flag if external wallet becomes available again
    if (linkedExternalWallets.length > 0 && !selectedIsEmbedded) {
      fallbackToastState.hasShown = false;
      fallbackToastState.toastId = null;
    }
  }, [wallets, ready, user?.linkedAccounts, selectedWallet]);

  return selectedWallet;
};
