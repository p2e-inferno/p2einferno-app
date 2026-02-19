/**
 * Fetches on-chain pool state from a Uniswap V3 pool contract.
 */

import type { PublicClient } from "viem";
import { UNISWAP_V3_POOL_ABI } from "./abi/pool";
import type { PoolState } from "./types";

export async function fetchPoolState(
  publicClient: PublicClient,
  poolAddress: `0x${string}`,
): Promise<PoolState> {
  const [token0, token1, fee, liquidity, slot0] = await Promise.all([
    publicClient.readContract({
      address: poolAddress,
      abi: UNISWAP_V3_POOL_ABI,
      functionName: "token0",
    }),
    publicClient.readContract({
      address: poolAddress,
      abi: UNISWAP_V3_POOL_ABI,
      functionName: "token1",
    }),
    publicClient.readContract({
      address: poolAddress,
      abi: UNISWAP_V3_POOL_ABI,
      functionName: "fee",
    }),
    publicClient.readContract({
      address: poolAddress,
      abi: UNISWAP_V3_POOL_ABI,
      functionName: "liquidity",
    }),
    publicClient.readContract({
      address: poolAddress,
      abi: UNISWAP_V3_POOL_ABI,
      functionName: "slot0",
    }),
  ]);

  return {
    token0: token0 as `0x${string}`,
    token1: token1 as `0x${string}`,
    fee: Number(fee),
    liquidity: liquidity as bigint,
    sqrtPriceX96: (slot0 as readonly [bigint, ...unknown[]])[0] as bigint,
    tick: Number((slot0 as readonly [unknown, number, ...unknown[]])[1]),
  };
}
