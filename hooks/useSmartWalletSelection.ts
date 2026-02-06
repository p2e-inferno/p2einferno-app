import { useMemo, useEffect, useRef } from "react";
import { useWallets, useUser } from "@privy-io/react-auth";
import { getLogger } from "@/lib/utils/logger";
import { selectLinkedWallet } from "@/lib/utils/wallet-selection";
import { isExternalWallet } from "@/lib/utils/wallet-address";
import toast from "react-hot-toast";

const log = getLogger("client:smart-wallet");

/**
 * Smart wallet selection hook that prioritizes external wallets over embedded ones
 * Returns the best available wallet for blockchain operations
 * Prioritizes wallets from user.linkedAccounts to avoid showing unlinked browser wallets
 */
export const useSmartWalletSelection = () => {
  const { wallets } = useWallets();
  const { user } = useUser();
  const hasShownFallbackToast = useRef(false);

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
        chainId: "eip155:84532",
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
    if (!user?.linkedAccounts || !selectedWallet) return;

    // Check if user has any linked external wallets
    const linkedExternalWallets = user.linkedAccounts.filter(
      (account) =>
        account.type === "wallet" && isExternalWallet((account as any).walletClientType)
    );

    // Check if selected wallet is embedded
    const selectedIsEmbedded = !isExternalWallet(selectedWallet.walletClientType);

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
        selectedWallet: selectedWallet.address,
      });
    }

    // Reset the flag if external wallet becomes available again
    if (linkedExternalWallets.length > 0 && !selectedIsEmbedded) {
      hasShownFallbackToast.current = false;
    }
  }, [user?.linkedAccounts, selectedWallet]);

  return selectedWallet;
};
