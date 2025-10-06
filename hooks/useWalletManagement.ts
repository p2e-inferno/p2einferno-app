import { useMemo, useState, useCallback } from "react";
import { getLogger } from "@/lib/utils/logger";
import {
  useUser,
  useCreateWallet as useCreateEthereumWallet,
  useSolanaWallets,
  WalletWithMetadata,
} from "@privy-io/react-auth";

const log = getLogger("hooks:useWalletManagement");

export function useWalletManagement() {
  const { user } = useUser();
  const { createWallet: createEthereumWallet } = useCreateEthereumWallet();
  const { createWallet: createSolanaWallet } = useSolanaWallets();
  const [isCreating, setIsCreating] = useState(false);

  const ethereumEmbeddedWallets = useMemo<WalletWithMetadata[]>(
    () =>
      (user?.linkedAccounts.filter(
        (account) =>
          account.type === "wallet" &&
          account.connectorType === "injected" &&
          account.chainType === "ethereum",
      ) as WalletWithMetadata[]) ?? [],
    [user],
  );

  const solanaEmbeddedWallets = useMemo<WalletWithMetadata[]>(
    () =>
      (user?.linkedAccounts.filter(
        (account) =>
          account.type === "wallet" &&
          account.walletClientType === "privy" &&
          account.chainType === "solana",
      ) as WalletWithMetadata[]) ?? [],
    [user],
  );

  const handleCreateWallet = useCallback(
    async (type: "ethereum" | "solana") => {
      setIsCreating(true);
      try {
        if (type === "ethereum") {
          await createEthereumWallet();
        } else if (type === "solana") {
          await createSolanaWallet();
        }
      } catch (error) {
        log.error("Error creating wallet:", error);
      } finally {
        setIsCreating(false);
      }
    },
    [createEthereumWallet, createSolanaWallet],
  );

  return {
    ethereumEmbeddedWallets,
    solanaEmbeddedWallets,
    isCreating,
    handleCreateWallet,
  };
}
