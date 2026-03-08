"use client";

import { useCallback, useState } from "react";
import { isAddress, parseEther, parseUnits } from "viem";
import { usePrivyWriteWallet } from "@/hooks/unlock/usePrivyWriteWallet";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import { ERC20_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import { formatWalletError } from "@/lib/utils/walletErrors";

const log = getLogger("hooks:useWalletTransfer");

type NativeTransferParams = {
  recipient: `0x${string}`;
  amountEth: string;
};

type ERC20TransferParams = {
  recipient: `0x${string}`;
  tokenAddress: `0x${string}`;
  amount: string;
  decimals: number;
};


export function useWalletTransfer() {
  const wallet = usePrivyWriteWallet();
  const [isTransferring, setIsTransferring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transferNative = useCallback(
    async (params: NativeTransferParams): Promise<`0x${string}`> => {
      if (!wallet) throw new Error("No wallet connected");
      if (!isAddress(params.recipient)) throw new Error("Invalid recipient");
      if (!params.amountEth || Number(params.amountEth) <= 0) {
        throw new Error("Amount must be greater than zero");
      }

      setIsTransferring(true);
      setError(null);

      try {
        const { walletClient, publicClient } =
          await createViemFromPrivyWallet(wallet);
        const hash = await walletClient.sendTransaction({
          account: walletClient.account ?? (wallet.address as `0x${string}`),
          chain: walletClient.chain,
          to: params.recipient,
          value: parseEther(params.amountEth),
        });

        await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
        return hash;
      } catch (err) {
        const message = formatWalletError(err);
        log.error("Native transfer failed", { err, params, wallet: wallet.address });
        setError(message);
        throw new Error(message);
      } finally {
        setIsTransferring(false);
      }
    },
    [wallet],
  );

  const transferErc20 = useCallback(
    async (params: ERC20TransferParams): Promise<`0x${string}`> => {
      if (!wallet) throw new Error("No wallet connected");
      if (!isAddress(params.recipient)) throw new Error("Invalid recipient");
      if (!isAddress(params.tokenAddress)) throw new Error("Invalid token contract");
      if (!params.amount || Number(params.amount) <= 0) {
        throw new Error("Amount must be greater than zero");
      }
      if (!Number.isFinite(params.decimals) || params.decimals < 0) {
        throw new Error("Invalid token decimals");
      }

      setIsTransferring(true);
      setError(null);

      try {
        const { walletClient, publicClient } =
          await createViemFromPrivyWallet(wallet);
        const hash = await walletClient.writeContract({
          address: params.tokenAddress,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [params.recipient, parseUnits(params.amount, params.decimals)],
          account: walletClient.account ?? (wallet.address as `0x${string}`),
          chain: walletClient.chain,
        });

        await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
        return hash;
      } catch (err) {
        const message = formatWalletError(err);
        log.error("ERC20 transfer failed", {
          err,
          params: {
            ...params,
            amount: params.amount,
          },
          wallet: wallet.address,
        });
        setError(message);
        throw new Error(message);
      } finally {
        setIsTransferring(false);
      }
    },
    [wallet],
  );

  return {
    transferNative,
    transferErc20,
    isTransferring,
    error,
  };
}

