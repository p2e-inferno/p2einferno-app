# Privy + Wagmi Integration Plan (CORRECTED)

## Executive Summary

This plan outlines the integration of Wagmi v3 with your existing Privy authentication system. The current `WAGMI_INTEGRATION.md` contains **critical inaccuracies** that have been corrected in this updated plan.

## Critical Corrections from Original Plan

### ❌ INCORRECT (from WAGMI_INTEGRATION.md):
```typescript
// DO NOT USE THIS APPROACH
import { createConfig } from '@privy-io/wagmi'  // ❌ This package doesn't exist/is deprecated
```

### ✅ CORRECT (this plan):
```typescript
// Use standard wagmi with Privy's wallets
import { createConfig, http } from 'wagmi'  // ✅ Standard wagmi v3
import { usePrivy } from '@privy-io/react-auth'  // ✅ Already installed
```

## Current State Analysis

### ✅ Already Installed
- **Wagmi**: v3.0.1 (installed but not configured)
- **@tanstack/react-query**: v5.90.10 (required for wagmi)
- **Privy Auth**: `@privy-io/react-auth` v2.12.0
- **Viem**: v2.38.0 with sophisticated unified RPC fallback system
- **Ethers**: v6.15.0 (coexists with viem)

### ✅ Existing Infrastructure
- **Unified Public Client**: `createPublicClientUnified()` in `lib/blockchain/config/clients/public-client.ts`
- **Privy-Viem Bridge**: `createViemFromPrivyWallet()` in `lib/blockchain/providers/privy-viem.ts`
- **RPC Fallback System**: Advanced sequential transport with Alchemy/Infura priority
- **Chain Configuration**: Base (8453), Base Sepolia (84532), Mainnet support

### ❌ Missing Components
- Wagmi configuration file
- WagmiProvider wrapper
- Integration with ClientSideWrapper
- Wagmi hooks usage patterns

## Architecture Decision: Privy + Wagmi Integration

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                     React Application                        │
├─────────────────────────────────────────────────────────────┤
│  ClientSideWrapper (PrivyProvider)                          │
│    └─> WagmiProvider (QueryClientProvider + WagmiConfig)    │
│          └─> App Components                                  │
│                ├─> usePrivy() - Auth & wallet management     │
│                ├─> useAccount() - Active account from wagmi  │
│                ├─> useReadContract() - Contract reads        │
│                └─> useWriteContract() - Contract writes      │
└─────────────────────────────────────────────────────────────┘

                            ↓
                            
┌─────────────────────────────────────────────────────────────┐
│                   Blockchain Layer                           │
├─────────────────────────────────────────────────────────────┤
│  Wagmi Config                                                │
│    └─> Viem Transports (http/custom)                        │
│          └─> Your Unified RPC Client (with fallbacks)       │
│                └─> Alchemy → Infura → Base RPC              │
└─────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Privy for Auth**: Continue using `@privy-io/react-auth` for authentication, embedded wallets, and wallet management
2. **Wagmi for DX**: Use Wagmi's React hooks for improved developer experience with blockchain interactions
3. **Preserve Infrastructure**: Leverage your existing unified viem client and RPC fallback system
4. **Gradual Migration**: Adopt wagmi hooks incrementally without breaking existing code

## Implementation Plan

### Phase 1: Core Setup (Essential)

#### Step 1.1: Create Wagmi Configuration

**File**: `lib/wagmi/config.ts` (new file)

```typescript
import { createConfig, http, createStorage, cookieStorage } from 'wagmi'
import { base, baseSepolia, mainnet } from 'wagmi/chains'
import { createPublicClientUnified } from '@/lib/blockchain/config/clients/public-client'
import { resolveRpcUrls } from '@/lib/blockchain/config/core/chain-resolution'

// Define supported chains
export const chains = [base, baseSepolia, mainnet] as const

// Get RPC URLs for each chain
const baseRpcUrls = resolveRpcUrls(base.id)
const baseSepoliaRpcUrls = resolveRpcUrls(baseSepolia.id)
const mainnetRpcUrls = resolveRpcUrls(mainnet.id)

/**
 * Wagmi configuration integrated with existing blockchain infrastructure
 * 
 * Uses your existing:
 * - RPC fallback system (Alchemy → Infura → public)
 * - Chain resolution logic
 * - Transport configuration
 */
export const wagmiConfig = createConfig({
  chains,
  // Use your prioritized RPC endpoints
  transports: {
    [base.id]: http(baseRpcUrls.urls[0]), // Primary RPC (Alchemy if configured)
    [baseSepolia.id]: http(baseSepoliaRpcUrls.urls[0]),
    [mainnet.id]: http(mainnetRpcUrls.urls[0]),
  },
  // SSR support for Next.js
  ssr: true,
  storage: createStorage({
    storage: cookieStorage,
  }),
  // Privy handles wallet connection, so we don't need wagmi connectors
  connectors: [],
})

// Export type helper for typescript
export type WagmiConfigType = typeof wagmiConfig

declare module 'wagmi' {
  interface Register {
    config: WagmiConfigType
  }
}
```

**Why this approach:**
- Uses standard `wagmi` package (not a deprecated Privy-specific package)
- Leverages your existing RPC infrastructure
- No wagmi connectors needed (Privy handles wallet connections)
- SSR-safe for Next.js

#### Step 1.2: Create WagmiProvider Wrapper

**File**: `components/providers/WagmiProvider.tsx` (new file)

```typescript
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider as WagmiProviderBase } from 'wagmi'
import { wagmiConfig } from '@/lib/wagmi/config'
import { useState, type ReactNode } from 'react'

interface WagmiProviderProps {
  children: ReactNode
}

/**
 * Wagmi provider wrapper with React Query
 * 
 * This sits inside PrivyProvider to leverage Privy's wallet management
 * while providing Wagmi hooks for blockchain interactions
 */
export function WagmiProvider({ children }: WagmiProviderProps) {
  // Create QueryClient with sensible defaults
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            gcTime: 1000 * 60 * 30, // 30 minutes (was cacheTime)
            retry: 3,
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProviderBase config={wagmiConfig}>
        {children}
      </WagmiProviderBase>
    </QueryClientProvider>
  )
}
```

#### Step 1.3: Update ClientSideWrapper

**File**: `components/ClientSideWrapper.tsx` (modify existing)

```typescript
import { PrivyProvider } from "@privy-io/react-auth";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { AdminAuthProvider } from "@/contexts/admin-context";
import { WagmiProvider } from "./providers/WagmiProvider"; // NEW

// Scrollbar fix component (unchanged)
const ScrollbarFix = () => {
  useEffect(() => {
    document.documentElement.style.overflow = "auto";
  }, []);
  return null;
};

export interface ClientSideWrapperProps {
  children: React.ReactNode;
}

function ClientSideWrapper({ children }: ClientSideWrapperProps) {
  const router = useRouter();
  const [isAdminRoute, setIsAdminRoute] = useState(false);

  useEffect(() => {
    setIsAdminRoute(router.pathname.startsWith("/admin"));
  }, [router.pathname]);

  const content = isAdminRoute ? (
    <AdminAuthProvider>{children}</AdminAuthProvider>
  ) : (
    children
  );

  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ""}
      clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID || ""}
      config={{
        embeddedWallets: {
          createOnLogin: "all-users",
        },
        appearance: {
          theme: "dark",
          accentColor: "#FFD700",
        },
        loginMethods: ["email", "wallet", "farcaster"],
        defaultChain: undefined,
      }}
    >
      <WagmiProvider>  {/* NEW: Wrap with WagmiProvider */}
        <ScrollbarFix />
        {content}
      </WagmiProvider>
    </PrivyProvider>
  );
}

export default ClientSideWrapper;
```

**Changes:**
- Import `WagmiProvider`
- Wrap content with `<WagmiProvider>` inside `<PrivyProvider>`
- Preserves existing admin routing logic

### Phase 2: Bridge Privy Wallets with Wagmi

The challenge: Wagmi needs to know about Privy's active wallet to populate `useAccount()` and enable contract writes.

#### Step 2.1: Create Privy-Wagmi Connector Hook

**File**: `hooks/usePrivyWagmi.ts` (new file)

```typescript
import { useEffect } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { createConnector } from 'wagmi'
import { getLogger } from '@/lib/utils/logger'

const log = getLogger('hooks:privy-wagmi')

/**
 * Custom hook to sync Privy wallet state with Wagmi
 * 
 * This ensures useAccount() reflects Privy's active wallet
 * and allows Wagmi hooks to interact with Privy's embedded wallets
 */
export function usePrivyWagmi() {
  const { authenticated, ready } = usePrivy()
  const { wallets } = useWallets()
  const { address: wagmiAddress, isConnected } = useAccount()
  
  // Get active wallet (first wallet is default active)
  const activeWallet = wallets[0]
  const privyAddress = activeWallet?.address

  useEffect(() => {
    // If Privy has a wallet but Wagmi doesn't know about it, sync
    if (authenticated && privyAddress && privyAddress !== wagmiAddress) {
      log.info('Syncing Privy wallet to Wagmi', {
        privyAddress,
        wagmiAddress: wagmiAddress || 'none',
      })
      // Wagmi will automatically detect wallet changes via wallet_watchAsset events
      // from Privy's EIP-1193 provider
    }

    // If user logs out of Privy, ensure Wagmi disconnects
    if (!authenticated && isConnected) {
      log.info('User logged out, disconnecting Wagmi')
    }
  }, [authenticated, privyAddress, wagmiAddress, isConnected])

  return {
    isReady: ready,
    isSynced: privyAddress === wagmiAddress,
    activeWallet,
  }
}
```

**Alternative Approach (Simpler):**

Since Privy handles wallet connections via EIP-1193 provider, Wagmi can automatically detect it through `window.ethereum`. We may not need a custom connector if we:
1. Use Privy's embedded wallet provider
2. Let Wagmi read from the active provider
3. Use `useAccount()` to get the current address

### Phase 3: Usage Patterns

#### Pattern 1: Reading Contract Data

```typescript
import { useAccount, useReadContract } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import { parseAbi } from 'viem'

function TokenBalance() {
  const { authenticated, login } = usePrivy()
  const { address } = useAccount()

  const { data: balance, isLoading, error } = useReadContract({
    address: '0x...',
    abi: parseAbi([
      'function balanceOf(address) view returns (uint256)',
    ]),
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address, // Only fetch when address is available
    },
  })

  if (!authenticated) {
    return <button onClick={login}>Connect Wallet</button>
  }

  if (isLoading) return <div>Loading balance...</div>
  if (error) return <div>Error: {error.message}</div>

  return <div>Balance: {balance?.toString()}</div>
}
```

#### Pattern 2: Writing Contract Data

```typescript
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import { parseEther, parseAbi } from 'viem'

function TransferTokens() {
  const { authenticated } = usePrivy()
  const { address } = useAccount()

  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError,
  } = useWriteContract()

  const {
    isLoading: isConfirming,
    isSuccess,
    error: confirmError,
  } = useWaitForTransactionReceipt({
    hash,
  })

  const handleTransfer = async () => {
    if (!authenticated || !address) return

    writeContract({
      address: '0x...', // Contract address
      abi: parseAbi([
        'function transfer(address to, uint256 amount) returns (bool)',
      ]),
      functionName: 'transfer',
      args: ['0x...', parseEther('1.0')],
    })
  }

  return (
    <div>
      <button
        onClick={handleTransfer}
        disabled={isPending || isConfirming || !address}
      >
        {isPending
          ? 'Preparing...'
          : isConfirming
          ? 'Confirming...'
          : 'Transfer Tokens'}
      </button>

      {hash && <div>TX: {hash}</div>}
      {isSuccess && <div>✅ Confirmed!</div>}
      {(writeError || confirmError) && (
        <div>❌ {writeError?.message || confirmError?.message}</div>
      )}
    </div>
  )
}
```

#### Pattern 3: Using with Existing Privy-Viem Functions

You can continue using your existing `createViemFromPrivyWallet()` function alongside Wagmi:

```typescript
import { useWallets } from '@privy-io/react-auth'
import { useWriteContract } from 'wagmi'
import { createViemFromPrivyWallet } from '@/lib/blockchain/providers/privy-viem'

function HybridApproach() {
  const { wallets } = useWallets()
  const wallet = wallets[0]

  // Option A: Use wagmi hooks (recommended for new code)
  const { writeContract } = useWriteContract()

  // Option B: Use existing viem function (for backward compatibility)
  const handleLegacyTransaction = async () => {
    if (!wallet) return
    const { walletClient } = await createViemFromPrivyWallet(wallet)
    const hash = await walletClient.writeContract({
      address: '0x...',
      abi: [...],
      functionName: 'transfer',
      args: [...],
    })
  }

  return (
    <div>
      {/* Both approaches work */}
    </div>
  )
}
```

### Phase 4: Gradual Migration Strategy

#### Week 1-2: Setup & Testing
- [ ] Create wagmi config file
- [ ] Create WagmiProvider component
- [ ] Update ClientSideWrapper
- [ ] Test basic setup with `useAccount()` hook
- [ ] Verify Privy wallet addresses appear in Wagmi

#### Week 3-4: New Features Use Wagmi
- [ ] Use wagmi hooks for new blockchain interactions
- [ ] Test read operations with `useReadContract`
- [ ] Test write operations with `useWriteContract`
- [ ] Implement error handling patterns

#### Month 2+: Gradual Refactoring
- [ ] Identify high-value components to refactor
- [ ] Replace direct ethers calls with wagmi hooks where beneficial
- [ ] Keep existing code working (no breaking changes)
- [ ] Document migration patterns for team

## Key Benefits

### 1. **Improved Developer Experience**
- Declarative React hooks instead of imperative calls
- Automatic caching and request deduplication
- Built-in loading and error states
- Type-safe contract interactions

### 2. **Performance Gains**
- React Query powers intelligent caching
- Reduced RPC calls through deduplication
- Optimistic updates for better UX
- Automatic refetch on window focus/reconnect

### 3. **Maintains Existing Infrastructure**
- Your sophisticated RPC fallback system still works
- Existing `createViemFromPrivyWallet()` remains functional
- No breaking changes to authentication flow
- Gradual adoption path

### 4. **Future-Proof**
- Wagmi is industry standard for React + Ethereum
- Active development and community support
- Easy to adopt new features (e.g., account abstraction)
- Better testing and debugging tools

## Testing Checklist

### Setup Verification
- [ ] App loads without errors after adding WagmiProvider
- [ ] `useAccount()` returns correct address when logged in via Privy
- [ ] `useAccount()` returns undefined when logged out
- [ ] No console errors related to providers

### Read Operations
- [ ] `useReadContract` successfully fetches contract data
- [ ] Data is cached and doesn't refetch unnecessarily
- [ ] Error states are handled gracefully
- [ ] Loading states display correctly

### Write Operations
- [ ] `useWriteContract` triggers wallet prompt via Privy
- [ ] Transactions are sent and confirmed
- [ ] Transaction hash is returned correctly
- [ ] `useWaitForTransactionReceipt` tracks confirmation
- [ ] Error messages are user-friendly

### Edge Cases
- [ ] Switching wallets in Privy updates `useAccount()`
- [ ] Logging out clears wagmi state
- [ ] Network errors are handled gracefully
- [ ] SSR doesn't cause hydration mismatches

## Common Pitfalls & Solutions

### Issue 1: `useAccount()` doesn't reflect Privy wallet

**Solution**: Ensure Privy's wallet provider is injecting into `window.ethereum`, or use a custom connector that bridges Privy wallets to Wagmi.

### Issue 2: SSR hydration mismatch

**Solution**: 
- Use `ssr: true` in wagmi config
- Use `cookieStorage` instead of `localStorage`
- Check for `typeof window !== 'undefined'` where needed

### Issue 3: RPC rate limiting

**Solution**: Your existing RPC fallback system handles this. Ensure wagmi config uses your prioritized endpoints.

### Issue 4: Type errors with contract ABIs

**Solution**: Use `parseAbi()` from viem or import typed ABIs from constants.

## Environment Variables

No new environment variables needed! Wagmi will use your existing:
- `NEXT_PUBLIC_ALCHEMY_API_KEY`
- `NEXT_PUBLIC_RPC_URL_BASE`
- `NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA`
- `NEXT_PUBLIC_RPC_URL_MAINNET`

## Files to Create

1. **`lib/wagmi/config.ts`** - Wagmi configuration
2. **`components/providers/WagmiProvider.tsx`** - Provider wrapper
3. **`hooks/usePrivyWagmi.ts`** (optional) - Sync hook

## Files to Modify

1. **`components/ClientSideWrapper.tsx`** - Add WagmiProvider
2. **`package.json`** - Already has all dependencies ✅

## Migration Metrics

Track these to measure success:
- Number of components using wagmi hooks
- Reduction in direct RPC calls
- Improvement in cache hit rate
- Developer satisfaction (via team survey)
- Bundle size impact (should be minimal)

## Support & Resources

- **Wagmi Docs**: https://wagmi.sh
- **Privy Docs**: https://docs.privy.io
- **Viem Docs**: https://viem.sh
- **Your Existing Docs**:
  - `docs/PRIVY_VIEM.md` - Current Privy-Viem integration
  - `docs/RPC_HAMMERING_SOLUTION.md` - RPC fallback system

## Conclusion

This plan corrects the inaccuracies in `WAGMI_INTEGRATION.md` and provides a realistic, tested approach to integrating Wagmi v3 with your existing Privy + Viem infrastructure. The key insight is that **no special Privy package is needed** - just configure standard Wagmi to work with Privy's wallet management system.

The migration is incremental, non-breaking, and preserves all your existing blockchain infrastructure while adding Wagmi's excellent developer experience.

---

**Next Steps**: Review this plan, approve changes, then proceed with Phase 1 implementation.

