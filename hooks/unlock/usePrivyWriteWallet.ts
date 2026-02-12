"use client";

import { useMemo } from "react";
import { useWallets, type ConnectedWallet } from "@privy-io/react-auth";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";

const hasPrivyWalletMethods = (wallet: Partial<ConnectedWallet>): boolean => {
  return (
    typeof (wallet as any)?.getEthereumProvider === "function" &&
    typeof (wallet as any)?.switchChain === "function"
  );
};

const findMatchingWallet = (
  address: string | undefined,
  wallets: ConnectedWallet[],
): ConnectedWallet | null => {
  if (!address) return null;
  const match = wallets.find(
    (wallet) => wallet.address?.toLowerCase() === address.toLowerCase(),
  );
  return match || null;
};

export const usePrivyWriteWallet = (): ConnectedWallet | null => {
  const { wallets } = useWallets();
  const smartWallet = useSmartWalletSelection() as
    | (ConnectedWallet & { address?: string })
    | { address?: string }
    | null;

  return useMemo(() => {
    const candidates: Array<typeof smartWallet | ConnectedWallet> = [];
    if (smartWallet) candidates.push(smartWallet as ConnectedWallet);
    candidates.push(...wallets);

    for (const candidate of candidates) {
      if (!candidate) continue;
      const maybeWallet = candidate as ConnectedWallet;

      if (hasPrivyWalletMethods(maybeWallet) && maybeWallet.address) {
        return maybeWallet;
      }

      const match = findMatchingWallet((candidate as any)?.address, wallets);
      if (match && hasPrivyWalletMethods(match)) return match;
    }

    const firstPrivyWallet = wallets.find((w) => hasPrivyWalletMethods(w));
    return firstPrivyWallet ?? null;
  }, [smartWallet, wallets]);
};
