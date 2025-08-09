import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import { 
  frontendReadOnlyProvider, 
  CURRENT_NETWORK, 
  ERC20_ABI 
} from '@/lib/blockchain/frontend-config';

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

export const useWalletBalances = () => {
  const { user } = usePrivy();
  const [balances, setBalances] = useState<WalletBalance>({
    eth: { balance: '0', formatted: '0.0000', loading: true },
    usdc: { balance: '0', formatted: '0.00', loading: true, symbol: 'USDC' },
  });
  const [error, setError] = useState<string | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);

  // Get the connected wallet address from provider (same logic as PrivyConnectButton)
  useEffect(() => {
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
          console.warn("Unable to fetch accounts from provider", err);
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
  }, []);

  // Use the same address resolution logic as PrivyConnectButton
  const walletAddress = connectedAddress || user?.wallet?.address || null;

  useEffect(() => {
    if (!walletAddress) {
      setBalances({
        eth: { balance: '0', formatted: '0.0000', loading: false },
        usdc: { balance: '0', formatted: '0.00', loading: false, symbol: 'USDC' },
      });
      return;
    }

    const fetchBalances = async () => {
      try {
        setError(null);

        // Use the reusable frontend provider
        const provider = frontendReadOnlyProvider;

        // Fetch ETH balance using ethers
        const ethBalance = await provider.getBalance(walletAddress);

        let usdcBalance = 0n;
        let usdcSymbol = 'USDC';

        // Fetch USDC balance
        try {
          if (provider) {
            const usdcContract = new ethers.Contract(CURRENT_NETWORK.usdcAddress, ERC20_ABI, provider);
            usdcBalance = await usdcContract.balanceOf?.(walletAddress) || 0n;
            usdcSymbol = await usdcContract.symbol?.() || 'USDC';
          }
        } catch (usdcError) {
          console.warn('Error fetching USDC balance:', usdcError);
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
        console.error('Error fetching wallet balances:', err);
        setError('Failed to fetch balances');
        setBalances({
          eth: { balance: '0', formatted: '0.0000', loading: false },
          usdc: { balance: '0', formatted: '0.00', loading: false, symbol: 'USDC' },
        });
      }
    };

    fetchBalances();

    // Refresh balances every 30 seconds
    const interval = setInterval(fetchBalances, 30000);
    return () => clearInterval(interval);
  }, [walletAddress]);

  const refreshBalances = async () => {
    if (!walletAddress) return;
    
    setBalances(prev => ({
      eth: { ...prev.eth, loading: true },
      usdc: { ...prev.usdc, loading: true },
    }));

    // Trigger a fresh balance fetch
    try {
      const provider = frontendReadOnlyProvider;

      const ethBalance = await provider.getBalance(walletAddress);
      let usdcBalance = 0n;
      let usdcSymbol = 'USDC';

      try {
        if (provider) {
          const usdcContract = new ethers.Contract(CURRENT_NETWORK.usdcAddress, ERC20_ABI, provider);
          [usdcBalance, usdcSymbol] = await Promise.all([
            (usdcContract as any).balanceOf(walletAddress) as Promise<bigint>,
            (usdcContract as any).symbol() as Promise<string>,
          ]);
        }
      } catch (usdcError) {
        console.warn('Error fetching USDC balance during refresh:', usdcError);
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
      console.error('Error refreshing wallet balances:', err);
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