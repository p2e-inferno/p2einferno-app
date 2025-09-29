import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import { getLogger } from '@/lib/utils/logger';
import { CURRENT_NETWORK, ERC20_ABI } from '@/lib/blockchain/legacy/frontend-config';
import { createPublicClientUnified } from '@/lib/blockchain/config';
import type { Address } from 'viem';

const log = getLogger('hooks:useWalletBalances');

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
}

interface UseWalletBalancesOptions {
  enabled?: boolean; // gate RPC usage and polling
  pollIntervalMs?: number; // default 30s
}

export const useWalletBalances = (options: UseWalletBalancesOptions = {}) => {
  const { enabled = true, pollIntervalMs = 30000 } = options;
  const { user } = usePrivy();
  const [balances, setBalances] = useState<WalletBalance>({
    eth: { balance: '0', formatted: '0.0000', loading: true },
    usdc: { balance: '0', formatted: '0.00', loading: true, symbol: 'USDC' },
  });
  const [error, setError] = useState<string | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);

  // Get the connected wallet address from provider (same logic as PrivyConnectButton)
  useEffect(() => {
    if (!enabled) {
      // When disabled, avoid touching provider and present non-loading zeros
      setConnectedAddress(null);
      setBalances({
        eth: { balance: '0', formatted: '0.0000', loading: false },
        usdc: { balance: '0', formatted: '0.00', loading: false, symbol: 'USDC' },
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
        eth: { balance: '0', formatted: '0.0000', loading: false },
        usdc: { balance: '0', formatted: '0.00', loading: false, symbol: 'USDC' },
      });
      return;
    }

    const fetchBalances = async () => {
      try {
        setError(null);

        // Use the unified read-only provider singleton
        const client = createPublicClientUnified();

        const ethBalance = await client.getBalance({
          address: walletAddress as Address,
        });

        let usdcBalance = 0n;
        let usdcSymbol = 'USDC';

        // Fetch USDC balance
        try {
          usdcBalance = await client.readContract({
            address: CURRENT_NETWORK.usdcAddress as Address,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [walletAddress as Address],
          }) as bigint;

          const symbol = await client.readContract({
            address: CURRENT_NETWORK.usdcAddress as Address,
            abi: ERC20_ABI,
            functionName: 'symbol',
          });

          if (typeof symbol === 'string') {
            usdcSymbol = symbol;
          }
        } catch (usdcError) {
          log.warn('Error fetching USDC balance:', { error: usdcError });
        }

        // Format balances using ethers
        const ethFormatted = ethers.formatEther(ethBalance);
        const usdcFormatted = ethers.formatUnits(usdcBalance, 6); // USDC has 6 decimals

        setBalances({
          eth: {
            balance: ethBalance.toString(),
            formatted: parseFloat(ethFormatted).toFixed(4),
            loading: false,
          },
          usdc: {
            balance: usdcBalance.toString(),
            formatted: parseFloat(usdcFormatted).toFixed(2),
            loading: false,
            symbol: usdcSymbol,
          },
        });
      } catch (err) {
        log.error('Error fetching wallet balances:', { error: err });
        setError('Failed to fetch balances');
        setBalances({
          eth: { balance: '0', formatted: '0.0000', loading: false },
          usdc: { balance: '0', formatted: '0.00', loading: false, symbol: 'USDC' },
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
    
    setBalances(prev => ({
      eth: { ...prev.eth, loading: true },
      usdc: { ...prev.usdc, loading: true },
    }));

    // Trigger a fresh balance fetch
    try {
      const client = createPublicClientUnified();

      const ethBalance = await client.getBalance({
        address: walletAddress as Address,
      });
      let usdcBalance = 0n;
      let usdcSymbol = 'USDC';

      try {
        const [balance, symbol] = await Promise.all([
          client.readContract({
            address: CURRENT_NETWORK.usdcAddress as Address,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [walletAddress as Address],
          }) as Promise<bigint>,
          client.readContract({
            address: CURRENT_NETWORK.usdcAddress as Address,
            abi: ERC20_ABI,
            functionName: 'symbol',
          }) as Promise<string>,
        ]);
        usdcBalance = balance;
        usdcSymbol = symbol;
      } catch (usdcError) {
        log.warn('Error fetching USDC balance during refresh:', { error: usdcError });
      }

      const ethFormatted = ethers.formatEther(ethBalance);
      const usdcFormatted = ethers.formatUnits(usdcBalance, 6);

      setBalances({
        eth: {
          balance: ethBalance.toString(),
          formatted: parseFloat(ethFormatted).toFixed(4),
          loading: false,
        },
        usdc: {
          balance: usdcBalance.toString(),
          formatted: parseFloat(usdcFormatted).toFixed(2),
          loading: false,
          symbol: usdcSymbol,
        },
      });
    } catch (err) {
      log.error('Error refreshing wallet balances:', { error: err });
      setError('Failed to refresh balances');
      setBalances(prev => ({
        eth: { ...prev.eth, loading: false },
        usdc: { ...prev.usdc, loading: false },
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
