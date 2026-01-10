"use client";

import { useReadContracts } from "wagmi";
import { useUser } from "@privy-io/react-auth";
import { useDetectConnectedWalletAddress } from "@/hooks/useDetectConnectedWalletAddress";
import { ERC20_ABI } from "@/lib/blockchain/shared/abi-definitions";

export function useDGTokenBalances(
  baseToken?: `0x${string}`,
  swapToken?: `0x${string}`,
) {
  const { user } = useUser();
  const { walletAddress } = useDetectConnectedWalletAddress(user);

  const enabled = !!walletAddress && !!baseToken && !!swapToken;

  const { data } = useReadContracts({
    allowFailure: true,
    contracts: !enabled
      ? []
      : [
          {
            address: baseToken!,
            abi: ERC20_ABI,
            functionName: "decimals",
          },
          {
            address: baseToken!,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [walletAddress! as `0x${string}`],
          },
          {
            address: baseToken!,
            abi: ERC20_ABI,
            functionName: "symbol",
          },
          {
            address: swapToken!,
            abi: ERC20_ABI,
            functionName: "decimals",
          },
          {
            address: swapToken!,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [walletAddress! as `0x${string}`],
          },
          {
            address: swapToken!,
            abi: ERC20_ABI,
            functionName: "symbol",
          },
        ],
  });

  if (!enabled || !data) {
    return {
      base: {
        decimals: undefined as number | undefined,
        balance: undefined as bigint | undefined,
        symbol: undefined as string | undefined,
      },
      swap: {
        decimals: undefined as number | undefined,
        balance: undefined as bigint | undefined,
        symbol: undefined as string | undefined,
      },
    };
  }

  const baseDecimals = data[0]?.result as number | undefined;
  const baseBalance = data[1]?.result as bigint | undefined;
  const baseSymbol = data[2]?.result as string | undefined;
  const swapDecimals = data[3]?.result as number | undefined;
  const swapBalance = data[4]?.result as bigint | undefined;
  const swapSymbol = data[5]?.result as string | undefined;

  return {
    base: { decimals: baseDecimals, balance: baseBalance, symbol: baseSymbol },
    swap: { decimals: swapDecimals, balance: swapBalance, symbol: swapSymbol },
  };
}
