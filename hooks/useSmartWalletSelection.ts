import { useMemo } from "react";
import { useWallets, useUser } from "@privy-io/react-auth";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("client:smart-wallet");

/**
 * Smart wallet selection hook that prioritizes external wallets over embedded ones
 * Returns the best available wallet for blockchain operations
 */
export const useSmartWalletSelection = () => {
  const { wallets } = useWallets();
  const { user } = useUser();

  const selectedWallet = useMemo(() => {
    log.debug("Available wallets", { wallets });
    log.debug("User linked accounts", { linkedAccounts: user?.linkedAccounts });

    // Priority 1: External wallet from useWallets (non-privy)
    const externalWallet = wallets.find((w) => w.walletClientType !== "privy");
    if (externalWallet) {
      log.info("✅ Found external wallet from useWallets", { externalWallet });
      return externalWallet;
    }

    // Priority 2: External wallet from linked accounts (injected wallets like MetaMask)
    if (user?.linkedAccounts) {
      const injectedAccount = user.linkedAccounts.find(
        (account) =>
          account.type === "wallet" &&
          account.connectorType === "injected" &&
          "address" in account &&
          account.address,
      );

      if (injectedAccount && "address" in injectedAccount) {
        log.info("✅ Found injected wallet from linked accounts", {
          injectedAccount,
        });
        // Create minimal wallet object for external wallet
        return {
          address: injectedAccount.address,
          walletClientType: "injected",
          connectorType: "injected",
          type: "ethereum" as const,
          chainId: "eip155:84532",
        };
      }
    }

    // Priority 3: Fallback to first available wallet (might be embedded)
    if (wallets.length > 0) {
      log.warn("⚠️ Falling back to first available wallet", {
        wallet: wallets[0],
      });
      return wallets[0];
    }

    log.info("❌ No wallets available");
    return null;
  }, [wallets, user?.linkedAccounts]);

  return selectedWallet;
};
