import { useState, useCallback } from "react";
import { useWallets } from "@privy-io/react-auth";
import { base } from "viem/chains";
import { toast } from "react-hot-toast";
import { ensureCorrectNetwork } from "@/lib/blockchain/shared/network-utils";
import { getLogger } from "@/lib/utils/logger";
import { isEmbeddedWallet } from "@/lib/utils/wallet-address";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";

const log = getLogger("hooks:useAddDGTokenToWallet");

// DG token lives on Base mainnet regardless of which network the app is currently
// targeting (e.g. Base Sepolia in dev).  Always switch to mainnet before calling
// wallet_watchAssets so the import succeeds.
const BASE_MAINNET_NETWORK_CONFIG = {
  chain: base,
  rpcUrl: "https://mainnet.base.org",
  networkName: "Base Mainnet",
};

export function useAddDGTokenToWallet() {
  const { wallets } = useWallets();
  const selectedWallet = useSmartWalletSelection();
  const [isLoading, setIsLoading] = useState(false);

  const activeWallet = wallets.find(w => w.address === selectedWallet?.address) || wallets?.[0];

  // Privy embedded wallets auto-discover tokens by balance — watchAssets is not
  // supported and not needed.  Only expose the action for injected / external wallets.
  const embedded = isEmbeddedWallet(activeWallet?.walletClientType);
  const isAvailable = !embedded && !!activeWallet;

  const addToken = useCallback(async () => {
    if (!activeWallet || embedded) return;

    const dgTokenAddress =
      process.env.NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_MAINNET;
    if (!dgTokenAddress) {
      log.warn("DG token address not configured");
      return;
    }

    setIsLoading(true);
    try {
      // Mirror the provider-access pattern used in useDGWithdrawal: prefer the
      // wallet's own provider, fall back to window.ethereum.
      const rawProvider =
        typeof (activeWallet as any)?.getEthereumProvider === "function"
          ? await (activeWallet as any).getEthereumProvider()
          : typeof window !== "undefined"
            ? (window as any).ethereum
            : null;

      if (!rawProvider) {
        throw new Error("No Ethereum provider available");
      }

      // Ensure the wallet is on Base mainnet before the watchAssets call.
      await ensureCorrectNetwork(rawProvider, BASE_MAINNET_NETWORK_CONFIG);

      const wasAdded = await rawProvider.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: {
            address: dgTokenAddress,
            symbol: "DG",
            decimals: 18,
            image: "https://zbgeglcumaaqrxcncrhn.supabase.co/storage/v1/object/public/logos/dg_token_logo.png",
          },
        },
      });

      if (wasAdded) {
        toast.success("DG token added to your wallet");
      }
    } catch (error: any) {
      // User dismissed the wallet popup — treat as a no-op, not an error.
      const code = error?.code;
      const msg = (error?.message || "").toString().toLowerCase();
      if (
        code === 4001 ||
        msg.includes("rejected") ||
        msg.includes("denied") ||
        msg.includes("cancel")
      ) {
        return;
      }

      log.error("Failed to add DG token to wallet", { error });
      toast.error("Failed to add DG token to wallet");
    } finally {
      setIsLoading(false);
    }
  }, [activeWallet, embedded]);

  return { addToken, isAvailable, isLoading };
}
