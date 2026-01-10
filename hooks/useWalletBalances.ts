import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { ethers } from "ethers";
import { getLogger } from "@/lib/utils/logger";
import {
  CURRENT_NETWORK,
  ERC20_ABI,
} from "@/lib/blockchain/legacy/frontend-config";
import { createPublicClientUnified } from "@/lib/blockchain/config";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import type { Address } from "viem";

const log = getLogger("hooks:useWalletBalances");

// Smart number formatting for token balances
function formatTokenBalance(balance: string, decimals: number): string {
  const num = parseFloat(ethers.formatUnits(balance, decimals));

  // Small numbers (< 10,000): Show full precision with thousand separators
  if (num < 10000) {
    return num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  // Large numbers: Abbreviate with K/M/B
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2) + "B";
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + "M";
  }
  if (num >= 10_000) {
    return (num / 1_000).toFixed(2) + "K";
  }

  return num.toFixed(2);
}

export interface WalletBalance {
  eth: {
    balance: string;
    formatted: string;
    loading: boolean;
  };
  usdc: {
    balance: string;
    formatted: string;
    loading: boolean;
    symbol: string;
  };
  dg: {
    balance: string;
    formatted: string;
    fullFormatted: string; // For tooltip
    loading: boolean;
    symbol: string;
  };
  up: {
    balance: string;
    formatted: string;
    fullFormatted: string; // For tooltip
    loading: boolean;
    symbol: string;
  };
}

interface UseWalletBalancesOptions {
  enabled?: boolean; // gate RPC usage and polling
  pollIntervalMs?: number; // default 30s
}

export const useWalletBalances = (options: UseWalletBalancesOptions = {}) => {
  const { enabled = true, pollIntervalMs = 30000 } = options;
  const { user } = usePrivy();
  const [balances, setBalances] = useState<WalletBalance>({
    eth: { balance: "0", formatted: "0.0000", loading: true },
    usdc: { balance: "0", formatted: "0.00", loading: true, symbol: "USDC" },
    dg: { balance: "0", formatted: "0.00", fullFormatted: "0.00", loading: true, symbol: "DG" },
    up: { balance: "0", formatted: "0.00", fullFormatted: "0.00", loading: true, symbol: "UP" },
  });
  const [error, setError] = useState<string | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);

  // Get the connected wallet address from provider (same logic as PrivyConnectButton)
  useEffect(() => {
    if (!enabled) {
      // When disabled, avoid touching provider and present non-loading zeros
      setConnectedAddress(null);
      setBalances({
        eth: { balance: "0", formatted: "0.0000", loading: false },
        usdc: { balance: "0", formatted: "0.00", loading: false, symbol: "USDC" },
        dg: { balance: "0", formatted: "0.00", fullFormatted: "0.00", loading: false, symbol: "DG" },
        up: { balance: "0", formatted: "0.00", fullFormatted: "0.00", loading: false, symbol: "UP" },
      });
      return;
    }
    let isMounted = true;

    const readProviderAddress = async () => {
      if (typeof window !== "undefined" && (window as any).ethereum) {
        try {
          const accounts: string[] | undefined = await (
            window as any
          ).ethereum.request({
            method: "eth_accounts",
          });
          if (isMounted) {
            let addr: string | null = null;
            if (Array.isArray(accounts) && accounts.length > 0) {
              addr = accounts[0] as string;
            }
            setConnectedAddress(addr ?? null);
          }
        } catch (err) {
          log.warn("Unable to fetch accounts from provider", { error: err });
        }
      }
    };

    readProviderAddress();

    // Also update whenever accounts change
    if (typeof window !== "undefined" && (window as any).ethereum) {
      const handler = (accounts: string[]) => {
        let addr: string | null = null;
        if (Array.isArray(accounts) && accounts.length > 0) {
          addr = accounts[0] as string;
        }
        setConnectedAddress(addr ?? null);
      };
      (window as any).ethereum.on("accountsChanged", handler);
      return () => {
        (window as any).ethereum.removeListener("accountsChanged", handler);
        isMounted = false;
      };
    }

    return () => {
      isMounted = false;
    };
  }, [enabled]);

  // Use the same address resolution logic as PrivyConnectButton
  const walletAddress = connectedAddress || user?.wallet?.address || null;

  useEffect(() => {
    if (!enabled || !walletAddress) {
      setBalances({
        eth: { balance: "0", formatted: "0.0000", loading: false },
        usdc: { balance: "0", formatted: "0.00", loading: false, symbol: "USDC" },
        dg: { balance: "0", formatted: "0.00", fullFormatted: "0.00", loading: false, symbol: "DG" },
        up: { balance: "0", formatted: "0.00", fullFormatted: "0.00", loading: false, symbol: "UP" },
      });
      return;
    }

    const fetchBalances = async () => {
      try {
        setError(null);

        // Use the unified read-only provider singleton for current network
        const client = createPublicClientUnified();

        // Create dedicated Base mainnet client for DG and UP tokens
        const baseClient = createPublicClient({
          chain: base,
          transport: http(),
        });

        const dgTokenAddress = process.env.NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_MAINNET as Address;
        const upTokenAddress = process.env.NEXT_PUBLIC_UP_TOKEN_ADDRESS_BASE_MAINNET as Address;

        // Fetch all balances in parallel
        const [ethBalance, usdcData, dgData, upData] = await Promise.all([
          client.getBalance({ address: walletAddress as Address }),

          // USDC on current network
          (async () => {
            try {
              const [balance, symbol] = await Promise.all([
                client.readContract({
                  address: CURRENT_NETWORK.usdcAddress as Address,
                  abi: ERC20_ABI,
                  functionName: "balanceOf",
                  args: [walletAddress as Address],
                }) as Promise<bigint>,
                client.readContract({
                  address: CURRENT_NETWORK.usdcAddress as Address,
                  abi: ERC20_ABI,
                  functionName: "symbol",
                }) as Promise<string>,
              ]);
              return { balance, symbol: typeof symbol === "string" ? symbol : "USDC" };
            } catch (error) {
              log.warn("Error fetching USDC balance:", { error });
              return { balance: 0n, symbol: "USDC" };
            }
          })(),

          // DG on Base mainnet
          (async () => {
            if (!dgTokenAddress) {
              return { balance: 0n, symbol: "DG" };
            }
            try {
              const [balance, symbol] = await Promise.all([
                baseClient.readContract({
                  address: dgTokenAddress,
                  abi: ERC20_ABI,
                  functionName: "balanceOf",
                  args: [walletAddress as Address],
                }) as Promise<bigint>,
                baseClient.readContract({
                  address: dgTokenAddress,
                  abi: ERC20_ABI,
                  functionName: "symbol",
                }) as Promise<string>,
              ]);
              return { balance, symbol: typeof symbol === "string" ? symbol : "DG" };
            } catch (error) {
              log.warn("Error fetching DG balance:", { error });
              return { balance: 0n, symbol: "DG" };
            }
          })(),

          // UP on Base mainnet
          (async () => {
            if (!upTokenAddress) {
              return { balance: 0n, symbol: "UP" };
            }
            try {
              const [balance, symbol] = await Promise.all([
                baseClient.readContract({
                  address: upTokenAddress,
                  abi: ERC20_ABI,
                  functionName: "balanceOf",
                  args: [walletAddress as Address],
                }) as Promise<bigint>,
                baseClient.readContract({
                  address: upTokenAddress,
                  abi: ERC20_ABI,
                  functionName: "symbol",
                }) as Promise<string>,
              ]);
              return { balance, symbol: typeof symbol === "string" ? symbol : "UP" };
            } catch (error) {
              log.warn("Error fetching UP balance:", { error });
              return { balance: 0n, symbol: "UP" };
            }
          })(),
        ]);

        // Format balances
        const ethFormatted = ethers.formatEther(ethBalance);
        const usdcFormatted = ethers.formatUnits(usdcData.balance, 6); // USDC has 6 decimals

        setBalances({
          eth: {
            balance: ethBalance.toString(),
            formatted: parseFloat(ethFormatted).toFixed(4),
            loading: false,
          },
          usdc: {
            balance: usdcData.balance.toString(),
            formatted: parseFloat(usdcFormatted).toFixed(2),
            loading: false,
            symbol: usdcData.symbol,
          },
          dg: {
            balance: dgData.balance.toString(),
            formatted: formatTokenBalance(dgData.balance.toString(), 18),
            fullFormatted: parseFloat(ethers.formatUnits(dgData.balance, 18)).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
            loading: false,
            symbol: dgData.symbol,
          },
          up: {
            balance: upData.balance.toString(),
            formatted: formatTokenBalance(upData.balance.toString(), 18),
            fullFormatted: parseFloat(ethers.formatUnits(upData.balance, 18)).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
            loading: false,
            symbol: upData.symbol,
          },
        });
      } catch (err) {
        log.error("Error fetching wallet balances:", { error: err });
        setError("Failed to fetch balances");
        setBalances({
          eth: { balance: "0", formatted: "0.0000", loading: false },
          usdc: { balance: "0", formatted: "0.00", loading: false, symbol: "USDC" },
          dg: { balance: "0", formatted: "0.00", fullFormatted: "0.00", loading: false, symbol: "DG" },
          up: { balance: "0", formatted: "0.00", fullFormatted: "0.00", loading: false, symbol: "UP" },
        });
      }
    };

    fetchBalances();

    // Refresh balances every 30 seconds
    const interval = setInterval(fetchBalances, pollIntervalMs);
    return () => clearInterval(interval);
  }, [walletAddress, enabled, pollIntervalMs]);

  const refreshBalances = async () => {
    if (!enabled || !walletAddress) return;

    setBalances((prev) => ({
      eth: { ...prev.eth, loading: true },
      usdc: { ...prev.usdc, loading: true },
      dg: { ...prev.dg, loading: true },
      up: { ...prev.up, loading: true },
    }));

    // Trigger a fresh balance fetch (reuse the same logic as fetchBalances)
    try {
      const client = createPublicClientUnified();
      const baseClient = createPublicClient({
        chain: base,
        transport: http(),
      });

      const dgTokenAddress = process.env.NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_MAINNET as Address;
      const upTokenAddress = process.env.NEXT_PUBLIC_UP_TOKEN_ADDRESS_BASE_MAINNET as Address;

      const [ethBalance, usdcData, dgData, upData] = await Promise.all([
        client.getBalance({ address: walletAddress as Address }),

        (async () => {
          try {
            const [balance, symbol] = await Promise.all([
              client.readContract({
                address: CURRENT_NETWORK.usdcAddress as Address,
                abi: ERC20_ABI,
                functionName: "balanceOf",
                args: [walletAddress as Address],
              }) as Promise<bigint>,
              client.readContract({
                address: CURRENT_NETWORK.usdcAddress as Address,
                abi: ERC20_ABI,
                functionName: "symbol",
              }) as Promise<string>,
            ]);
            return { balance, symbol: typeof symbol === "string" ? symbol : "USDC" };
          } catch (error) {
            log.warn("Error fetching USDC balance during refresh:", { error });
            return { balance: 0n, symbol: "USDC" };
          }
        })(),

        (async () => {
          if (!dgTokenAddress) return { balance: 0n, symbol: "DG" };
          try {
            const [balance, symbol] = await Promise.all([
              baseClient.readContract({
                address: dgTokenAddress,
                abi: ERC20_ABI,
                functionName: "balanceOf",
                args: [walletAddress as Address],
              }) as Promise<bigint>,
              baseClient.readContract({
                address: dgTokenAddress,
                abi: ERC20_ABI,
                functionName: "symbol",
              }) as Promise<string>,
            ]);
            return { balance, symbol: typeof symbol === "string" ? symbol : "DG" };
          } catch (error) {
            log.warn("Error fetching DG balance during refresh:", { error });
            return { balance: 0n, symbol: "DG" };
          }
        })(),

        (async () => {
          if (!upTokenAddress) return { balance: 0n, symbol: "UP" };
          try {
            const [balance, symbol] = await Promise.all([
              baseClient.readContract({
                address: upTokenAddress,
                abi: ERC20_ABI,
                functionName: "balanceOf",
                args: [walletAddress as Address],
              }) as Promise<bigint>,
              baseClient.readContract({
                address: upTokenAddress,
                abi: ERC20_ABI,
                functionName: "symbol",
              }) as Promise<string>,
            ]);
            return { balance, symbol: typeof symbol === "string" ? symbol : "UP" };
          } catch (error) {
            log.warn("Error fetching UP balance during refresh:", { error });
            return { balance: 0n, symbol: "UP" };
          }
        })(),
      ]);

      const ethFormatted = ethers.formatEther(ethBalance);
      const usdcFormatted = ethers.formatUnits(usdcData.balance, 6);

      setBalances({
        eth: {
          balance: ethBalance.toString(),
          formatted: parseFloat(ethFormatted).toFixed(4),
          loading: false,
        },
        usdc: {
          balance: usdcData.balance.toString(),
          formatted: parseFloat(usdcFormatted).toFixed(2),
          loading: false,
          symbol: usdcData.symbol,
        },
        dg: {
          balance: dgData.balance.toString(),
          formatted: formatTokenBalance(dgData.balance.toString(), 18),
          fullFormatted: parseFloat(ethers.formatUnits(dgData.balance, 18)).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
          loading: false,
          symbol: dgData.symbol,
        },
        up: {
          balance: upData.balance.toString(),
          formatted: formatTokenBalance(upData.balance.toString(), 18),
          fullFormatted: parseFloat(ethers.formatUnits(upData.balance, 18)).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
          loading: false,
          symbol: upData.symbol,
        },
      });
    } catch (err) {
      log.error("Error refreshing wallet balances:", { error: err });
      setError("Failed to refresh balances");
      setBalances((prev) => ({
        eth: { ...prev.eth, loading: false },
        usdc: { ...prev.usdc, loading: false },
        dg: { ...prev.dg, loading: false },
        up: { ...prev.up, loading: false },
      }));
    }
  };

  const networkName = CURRENT_NETWORK.displayName;

  return {
    balances,
    loading: balances.eth.loading || balances.usdc.loading,
    error,
    refreshBalances,
    hasWallet: !!walletAddress,
    networkName,
  };
};
