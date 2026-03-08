import { useMemo, useEffect, useState } from "react";
import { useWallets, useUser, usePrivy } from "@privy-io/react-auth";
import { getLogger } from "@/lib/utils/logger";
import {
  getLinkedWalletAddressSet,
  isWalletAddressLinkedToUser,
  selectLinkedWallet,
} from "@/lib/utils/wallet-selection";
import { isExternalWallet } from "@/lib/utils/wallet-address";
import toast from "react-hot-toast";
import { CHAIN_ID } from "@/lib/blockchain/config";
import { WalletFallbackToast } from "@/components/ui/wallet-fallback-toast";

const log = getLogger("client:smart-wallet");

// Shared state across all hook instances to prevent duplicate toasts
const fallbackToastState = {
  hasShown: false,
  toastId: null as string | null,
  checkStartTime: 0,
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

  // Determine available wallet identifiers to stabilize memoization
  const walletStateKey = useMemo(() => {
    return (
      wallets.map((w) => `${w.address}-${w.walletClientType}`).join(",") +
      "|" +
      (user?.id ?? "none") +
      "|" +
      (user?.linkedAccounts?.length ?? 0)
    );
  }, [wallets, user]);

  const selectedWallet = useMemo(() => {
    log.debug("Recalculating selected wallet", { walletStateKey });

    // Priority 1 & 2: Select from linked accounts with device availability check
    const linkedWallet = selectLinkedWallet(user, wallets);
    if (linkedWallet) {
      const isExternal = isExternalWallet(linkedWallet.walletClientType);

      log.info(
        `✅ Found ${isExternal ? "external" : "embedded"} wallet from linked accounts`,
        { address: linkedWallet.address },
      );

      return {
        address: linkedWallet.address,
        walletClientType: linkedWallet.walletClientType || "privy",
        connectorType:
          linkedWallet.connectorType || (isExternal ? "injected" : "embedded"),
        type: "ethereum" as const,
        chainId: `eip155:${CHAIN_ID}`,
      };
    }

    // If user has linked wallets but no linked wallet could be resolved safely yet,
    // return null instead of falling back to an unlinked browser wallet.
    const linkedWalletSet = getLinkedWalletAddressSet(user);
    if (linkedWalletSet.size > 0) {
      log.warn(
        "⚠️ Linked wallets exist but no safe linked wallet is currently resolvable",
        {
          linkedWalletCount: linkedWalletSet.size,
        },
      );
      return null;
    }

    // If no linked wallet exists on the user, only allow fallback to provider wallet
    // when that provider wallet is actually linked (defensive check).
    if (wallets.length > 0) {
      const fallbackWallet = wallets[0];
      const fallbackAddress = fallbackWallet?.address || null;
      if (isWalletAddressLinkedToUser(user, fallbackAddress)) {
        log.warn("⚠️ Falling back to linked provider wallet", {
          address: fallbackAddress,
        });
        return fallbackWallet;
      }
    }

    log.info("❌ No wallets available");
    return null;
  }, [walletStateKey, wallets, user]);

  // Track initialization state for delayed toast
  const [initializationComplete, setInitializationComplete] = useState(false);

  // Mark initialization as complete after a delay (allows mobile wallet providers to inject)
  // Only runs once when Privy becomes ready to avoid timer reset on wallet changes
  useEffect(() => {
    if (!ready) return;

    // Start the check timer when Privy is ready
    if (fallbackToastState.checkStartTime === 0) {
      fallbackToastState.checkStartTime = Date.now();
    }

    // Wait 2.5 seconds before marking initialization complete
    // This gives mobile wallet providers time to inject
    const timer = setTimeout(() => {
      setInitializationComplete(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, [ready]); // Only depend on ready, not wallets.length to avoid timer resets

  // Detect when we fell back from external to embedded wallet (with delay for mobile)
  useEffect(() => {
    // Don't evaluate until initialization is complete
    if (!initializationComplete) return;
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

      log.info("Showed fallback notification after delay (shared state)", {
        linkedExternalCount: linkedExternalWallets.length,
        selectedWallet: selectedWallet.address,
        delayMs: Date.now() - fallbackToastState.checkStartTime,
      });
    }

    // Reset the flag if external wallet becomes available again
    if (linkedExternalWallets.length > 0 && !selectedIsEmbedded) {
      if (fallbackToastState.hasShown) {
        log.info("External wallet became available, dismissing fallback toast");
        if (fallbackToastState.toastId) {
          toast.dismiss(fallbackToastState.toastId);
        }
      }
      fallbackToastState.hasShown = false;
      fallbackToastState.toastId = null;
      fallbackToastState.checkStartTime = 0;
    }
  }, [initializationComplete, ready, user, selectedWallet]);

  return selectedWallet;
};
