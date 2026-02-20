"use client";

/**
 * Main React hook for Uniswap V3 swaps with frontend fee.
 *
 * Provides quoting, balance fetching, and step building for the transaction stepper.
 * Uses ensureWalletOnChainId + manual walletClient to guarantee Base Mainnet targeting.
 */

import { useState, useCallback } from "react";
import { base } from "viem/chains";
import { createWalletClient, custom, encodePacked } from "viem";
import { usePrivyWriteWallet } from "@/hooks/unlock/usePrivyWriteWallet";
import { ensureWalletOnChainId } from "@/lib/blockchain/shared/ensure-wallet-network";
import { createPublicClientForChain } from "@/lib/blockchain/config";
import type { DeploymentStep } from "@/lib/transaction-stepper/types";
import {
  UNISWAP_ADDRESSES,
  FEE_CONFIG,
  DEFAULT_DEADLINE_SECONDS,
  resolvePoolTokens,
  validateFeeConfig,
} from "@/lib/uniswap/constants";
import { fetchPoolState } from "@/lib/uniswap/pool";
import {
  getQuoteExactInput,
  getQuoteExactInputSingle,
} from "@/lib/uniswap/quote";
import { encodeSwapWithFeeManual } from "@/lib/uniswap/encode-swap";
import {
  checkErc20ApprovalForPermit2,
  checkPermit2Allowance,
  approveTokenForPermit2,
  approveUniversalRouterViaPermit2,
} from "@/lib/uniswap/permit2";
import { ERC20_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import type {
  SwapPair,
  SwapDirection,
  SwapQuote,
  QuoteResult,
  PoolState,
} from "@/lib/uniswap/types";

const log = getLogger("hooks:vendor:uniswap-swap");

interface SwapState {
  quote: SwapQuote | null;
  isQuoting: boolean;
  error: string | null;
  balance: bigint | null;
}

export function useUniswapSwap() {
  const wallet = usePrivyWriteWallet();
  const addresses = UNISWAP_ADDRESSES;

  const [state, setState] = useState<SwapState>({
    quote: null,
    isQuoting: false,
    error: null,
    balance: null,
  });

  /**
   * Fetch user's balance for the input side of a swap.
   */
  const fetchBalance = useCallback(
    async (
      pair: SwapPair,
      direction: SwapDirection,
    ): Promise<bigint | null> => {
      if (!wallet?.address) return null;

      try {
        const publicClient = createPublicClientForChain(base);
        const userAddress = wallet.address as `0x${string}`;

        const isEthPair = pair === "ETH_UP" || pair === "ETH_USDC";
        const isBuySide = direction === "A_TO_B";

        if (isEthPair && isBuySide) {
          const balance = await publicClient.getBalance({
            address: userAddress,
          });
          setState((prev) => ({ ...prev, balance }));
          return balance;
        } else {
          // Resolve the ERC20 token address for the input side.
          // All pairs have known token addresses — no RPC needed.
          let tokenIn: `0x${string}`;
          if (pair === "ETH_UP") {
            tokenIn = addresses.up;
          } else if (pair === "ETH_USDC") {
            tokenIn = addresses.usdc;
          } else {
            // UP_USDC
            tokenIn = direction === "A_TO_B" ? addresses.up : addresses.usdc;
          }

          const balance = (await publicClient.readContract({
            address: tokenIn,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [userAddress],
          })) as bigint;

          setState((prev) => ({ ...prev, balance }));
          return balance;
        }
      } catch (err) {
        log.error("Balance fetch failed", { err });
        return null;
      }
    },
    [wallet?.address, addresses],
  );

  /**
   * Fetch a quote for the given swap.
   * Does NOT require a connected wallet — uses public client only.
   */
  const getQuote = useCallback(
    async (
      pair: SwapPair,
      direction: SwapDirection,
      amountIn: bigint,
    ): Promise<SwapQuote | null> => {
      setState((prev) => ({
        ...prev,
        quote: null,
        isQuoting: true,
        error: null,
      }));

      try {
        validateFeeConfig();

        const publicClient = createPublicClientForChain(base);
        let quoteResult: QuoteResult;
        let poolState: PoolState | null = null;

        if (pair === "UP_USDC") {
          const path =
            direction === "A_TO_B"
              ? encodePacked(
                  ["address", "uint24", "address", "uint24", "address"],
                  [addresses.up, 3000, addresses.weth, 500, addresses.usdc],
                )
              : encodePacked(
                  ["address", "uint24", "address", "uint24", "address"],
                  [addresses.usdc, 500, addresses.weth, 3000, addresses.up],
                );
          quoteResult = await getQuoteExactInput(
            publicClient,
            addresses.quoterV2,
            { path, amountIn },
          );
        } else {
          const poolAddress = addresses.pools[pair as "ETH_UP" | "ETH_USDC"];
          poolState = await fetchPoolState(publicClient, poolAddress);
          const { wethToken, otherToken } = resolvePoolTokens(
            poolState.token0,
            poolState.token1,
          );
          const tokenIn = direction === "A_TO_B" ? wethToken : otherToken;
          const tokenOut = direction === "A_TO_B" ? otherToken : wethToken;
          quoteResult = await getQuoteExactInputSingle(
            publicClient,
            addresses.quoterV2,
            { tokenIn, tokenOut, fee: poolState.fee, amountIn },
          );
        }

        const feeAmount =
          (quoteResult.amountOut * BigInt(FEE_CONFIG.feeBips)) / 10_000n;
        const userReceives = quoteResult.amountOut - feeAmount;

        // Price impact from sqrtPriceX96 shift (single-hop only)
        let priceImpact = 0;
        if (pair !== "UP_USDC" && poolState) {
          const priceBefore = poolState.sqrtPriceX96 * poolState.sqrtPriceX96;
          const priceAfter =
            quoteResult.sqrtPriceX96After > 0n
              ? quoteResult.sqrtPriceX96After * quoteResult.sqrtPriceX96After
              : priceBefore;
          if (priceBefore > 0n) {
            const PRECISION = 10n ** 18n;
            const ratio = (priceAfter * PRECISION) / priceBefore;
            priceImpact =
              (Math.abs(Number(ratio - PRECISION)) / Number(PRECISION)) * 100;
          }
        }

        const quote: SwapQuote = {
          amountOut: quoteResult.amountOut,
          feeAmount,
          userReceives,
          priceImpact,
          gasEstimate: quoteResult.gasEstimate,
        };

        setState((prev) => ({ ...prev, quote, isQuoting: false }));
        return quote;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Quote failed";
        log.error("Quote failed", { err });
        setState((prev) => ({ ...prev, isQuoting: false, error: msg }));
        return null;
      }
    },
    [addresses],
  );

  /**
   * Build DeploymentStep[] for the swap, to be consumed by useTransactionStepper.
   *
   * IMPORTANT: We do NOT use createViemFromPrivyWallet here because it switches
   * the wallet to the app's configured chain (Base Sepolia in dev), not Base Mainnet.
   * Instead, we use ensureWalletOnChainId + manual walletClient targeting `base`.
   *
   * @param amountOutMin — the pre-fee minimum swap output (raw quote * (1 - slippage)).
   */
  const buildSwapSteps = useCallback(
    async (
      pair: SwapPair,
      direction: SwapDirection,
      amountIn: bigint,
      amountOutMin: bigint,
    ): Promise<DeploymentStep[]> => {
      if (!wallet) throw new Error("Wallet not connected");
      validateFeeConfig();

      // Explicitly switch wallet to Base Mainnet (chain 8453).
      const provider = await wallet.getEthereumProvider();
      await ensureWalletOnChainId(provider, {
        chainId: 8453,
        networkName: "Base Mainnet",
      });

      const walletClient = createWalletClient({
        account: wallet.address as `0x${string}`,
        chain: base,
        transport: custom(provider),
      });
      const publicClient = createPublicClientForChain(base);
      const userAddress = wallet.address as `0x${string}`;
      const isEthPair = pair === "ETH_UP" || pair === "ETH_USDC";
      const isNativeEthIn = isEthPair && direction === "A_TO_B";
      const isNativeEthOut = isEthPair && direction === "B_TO_A";

      let tokenIn: `0x${string}`;
      let tokenOut: `0x${string}`;
      let path: `0x${string}`;

      if (pair === "UP_USDC") {
        if (direction === "A_TO_B") {
          tokenIn = addresses.up;
          tokenOut = addresses.usdc;
          path = encodePacked(
            ["address", "uint24", "address", "uint24", "address"],
            [addresses.up, 3000, addresses.weth, 500, addresses.usdc],
          );
        } else {
          tokenIn = addresses.usdc;
          tokenOut = addresses.up;
          path = encodePacked(
            ["address", "uint24", "address", "uint24", "address"],
            [addresses.usdc, 500, addresses.weth, 3000, addresses.up],
          );
        }
      } else {
        const poolAddress = addresses.pools[pair as "ETH_UP" | "ETH_USDC"];
        const poolState = await fetchPoolState(publicClient, poolAddress);
        const { wethToken, otherToken } = resolvePoolTokens(
          poolState.token0,
          poolState.token1,
        );
        tokenIn = direction === "A_TO_B" ? wethToken : otherToken;
        tokenOut = direction === "A_TO_B" ? otherToken : wethToken;
        path = encodePacked(
          ["address", "uint24", "address"],
          [tokenIn, poolState.fee, tokenOut],
        );
      }

      // --- Balance check (prevent wasted gas on guaranteed-to-fail txs) ---
      if (isNativeEthIn) {
        const ethBalance = await publicClient.getBalance({
          address: userAddress,
        });
        if (ethBalance < amountIn) throw new Error("Insufficient ETH balance");
      } else {
        const tokenBalance = (await publicClient.readContract({
          address: tokenIn,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [userAddress],
        })) as bigint;
        if (tokenBalance < amountIn)
          throw new Error("Insufficient token balance");
      }

      // --- Build steps array (conditional approvals + swap) ---
      const steps: DeploymentStep[] = [];

      if (!isNativeEthIn) {
        // Step A: ERC20 -> Permit2 (one-time per token, MAX_UINT256)
        const erc20Allowance = await checkErc20ApprovalForPermit2(
          publicClient,
          tokenIn,
          userAddress,
          addresses.permit2,
        );
        if (erc20Allowance < amountIn) {
          steps.push({
            id: "approve-erc20",
            title: "Approve token for Permit2",
            description:
              "One-time ERC20 approval so Permit2 can access your tokens",
            async execute() {
              const hash = await approveTokenForPermit2(
                walletClient,
                tokenIn,
                addresses.permit2,
              );
              return {
                transactionHash: hash,
                async waitForConfirmation() {
                  const receipt = await publicClient.waitForTransactionReceipt({
                    hash,
                  });
                  if (receipt.status === "reverted") {
                    throw new Error(
                      "ERC20 approval transaction reverted on-chain",
                    );
                  }
                  return { transactionHash: hash };
                },
              };
            },
          });
        }

        // Step B: Permit2 -> Universal Router (one-time, MAX_UINT160 + MAX_UINT48 expiry)
        const permit2Allowance = await checkPermit2Allowance(
          publicClient,
          addresses.permit2,
          userAddress,
          tokenIn,
          addresses.universalRouter,
        );
        const nowSeconds = Math.floor(Date.now() / 1000);
        const isExpired = permit2Allowance.expiration <= nowSeconds;
        if (permit2Allowance.amount < amountIn || isExpired) {
          steps.push({
            id: "approve-permit2",
            title: "Approve Universal Router via Permit2",
            description: "One-time Permit2 allowance for the Universal Router",
            async execute() {
              const hash = await approveUniversalRouterViaPermit2(
                walletClient,
                addresses.permit2,
                tokenIn,
                addresses.universalRouter,
              );
              return {
                transactionHash: hash,
                async waitForConfirmation() {
                  const receipt = await publicClient.waitForTransactionReceipt({
                    hash,
                  });
                  if (receipt.status === "reverted") {
                    throw new Error(
                      "Permit2 approval transaction reverted on-chain",
                    );
                  }
                  return { transactionHash: hash };
                },
              };
            },
          });
        }
      }

      // Final step: the swap itself.
      // Deadline and calldata are computed inside execute() so the 5-minute
      // window starts when the user actually signs, not when steps are built
      // (approval steps may consume significant time before this fires).
      steps.push({
        id: "swap",
        title: "Execute Swap",
        description: "Send swap transaction to the Universal Router",
        async execute() {
          const deadline =
            Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS;
          const { calldata, value } = encodeSwapWithFeeManual({
            tokenOut,
            path,
            amountIn,
            amountOutMin,
            recipient: userAddress,
            feeRecipient: FEE_CONFIG.feeRecipient,
            feeBips: FEE_CONFIG.feeBips,
            isNativeEthIn,
            isNativeEthOut,
            deadline,
          });

          // Pre-flight gas estimation to catch reverts before the user signs
          const txParams = {
            to: addresses.universalRouter,
            data: calldata,
            value,
            account: walletClient.account ?? userAddress,
          };
          try {
            await publicClient.estimateGas(txParams);
          } catch (estimateErr) {
            const reason =
              estimateErr instanceof Error
                ? estimateErr.message
                : "Unknown error";
            log.error("Swap gas estimation failed — transaction would revert", {
              reason,
            });
            throw new Error(
              `Swap would fail on-chain: ${reason.slice(0, 200)}`,
            );
          }

          const hash = await walletClient.sendTransaction({
            ...txParams,
            chain: walletClient.chain,
          });
          log.info("Swap transaction submitted", { txHash: hash });
          return {
            transactionHash: hash,
            async waitForConfirmation() {
              const receipt = await publicClient.waitForTransactionReceipt({
                hash,
              });
              if (receipt.status === "reverted") {
                throw new Error(
                  "Swap transaction reverted on-chain. The swap may have expired or slippage was exceeded.",
                );
              }
              log.info("Swap confirmed", { txHash: hash });
              return { transactionHash: hash };
            },
          };
        },
      });

      return steps;
    },
    [wallet, addresses],
  );

  return {
    ...state,
    getQuote,
    buildSwapSteps,
    fetchBalance,
    isSupported: true,
    feeBips: FEE_CONFIG.feeBips,
  };
}
