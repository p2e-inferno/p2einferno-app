# Privy + Wagmi Integration Plan

## Current Codebase Analysis

**✅ Already Configured:**
- Privy Auth: `@privy-io/react-auth` v2.12.0 with embedded wallets
- Blockchain: viem v2.31.3 + ethers v6.15.0
- Unified Provider System: Advanced viem-based RPC fallback in `lib/blockchain/config/unified-config.ts`
- Auth Hooks: `lib/auth/hooks/useAuth.ts` with blockchain admin verification

**❌ Missing for Wagmi:**
- `@privy-io/wagmi` package (replaces old wagmi-connector)
- `@tanstack/react-query`
- `wagmi` package

## Implementation Plan

### 1. Package Installation
```bash
npm install @privy-io/wagmi wagmi @tanstack/react-query
```

### 2. Wagmi Configuration (`lib/wagmi/config.ts`)
```typescript
import { createConfig } from '@privy-io/wagmi'
import { createPublicClientUnified } from '@/lib/blockchain/config/unified-config'
import { base, baseSepolia, mainnet } from 'viem/chains'

const chains = [base, baseSepolia, mainnet] as const

export const wagmiConfig = createConfig({
  chains,
  // Leverage existing unified viem client
  client: () => createPublicClientUnified(),
})
```

### 3. Provider Integration (`components/providers/WagmiProvider.tsx`)
```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from '@/lib/wagmi/config'
import { useState } from 'react'

export function WagmiProviderWrapper({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 1000 * 60 * 5 }, // 5 minutes
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        {children}
      </WagmiProvider>
    </QueryClientProvider>
  )
}
```

### 4. Update ClientSideWrapper
```typescript
// components/ClientSideWrapper.tsx
import { PrivyProvider } from "@privy-io/react-auth"
import { WagmiProviderWrapper } from "./providers/WagmiProvider"

function ClientSideWrapper({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ""} config={{...}}>
      <WagmiProviderWrapper>
        <ScrollbarFix />
        {children}
      </WagmiProviderWrapper>
    </PrivyProvider>
  )
}
```

### 5. Usage Patterns

#### Reading Contract Data
```typescript
import { usePrivy } from '@privy-io/react-auth'
import { useAccount, useReadContract } from 'wagmi'

function TokenBalance() {
  // Privy for auth/wallet connection
  const { user, login, authenticated } = usePrivy()

  // Wagmi for blockchain interactions
  const { address } = useAccount()
  const { data: balance } = useReadContract({
    address: '0x...',
    abi: [...],
    functionName: 'balanceOf',
    args: [address],
  })

  return <div>Balance: {balance?.toString()}</div>
}
```

#### Writing Contract Data
```typescript
import { usePrivy } from '@privy-io/react-auth'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther } from 'viem'

function TransferTokens() {
  const { user, authenticated } = usePrivy()
  const { address } = useAccount()
  const {
    writeContract,
    data: hash,
    isPending: isWritePending,
    error: writeError
  } = useWriteContract()

  // Wait for transaction confirmation
  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: confirmError
  } = useWaitForTransactionReceipt({
    hash,
  })

  const handleTransfer = async () => {
    if (!authenticated || !address) return

    writeContract({
      address: '0x...', // Contract address
      abi: [
        {
          name: 'transfer',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ],
          outputs: [{ name: '', type: 'bool' }]
        }
      ],
      functionName: 'transfer',
      args: [
        '0x...', // recipient address
        parseEther('1.0') // amount in wei
      ],
    })
  }

  return (
    <div>
      <button
        onClick={handleTransfer}
        disabled={isWritePending || isConfirming}
      >
        {isWritePending ? 'Preparing...' :
         isConfirming ? 'Confirming...' :
         'Transfer Tokens'}
      </button>

      {hash && <div>Transaction Hash: {hash}</div>}
      {isConfirmed && <div>✅ Transaction confirmed!</div>}
      {(writeError || confirmError) && (
        <div>❌ Error: {writeError?.message || confirmError?.message}</div>
      )}
    </div>
  )
}
```

## Key Benefits

1. **Preserves Existing System**: Your unified viem provider stays intact
2. **Best of Both**: Privy for auth, wagmi for DX/hooks
3. **Gradual Migration**: Can adopt wagmi hooks incrementally
4. **Performance**: Leverages your optimized RPC fallback system
5. **Type Safety**: Full TypeScript support across the stack

## Migration Strategy

- **Phase 1**: Install packages + basic setup (this plan)
- **Phase 2**: Replace blockchain interactions with wagmi hooks where beneficial
- **Phase 3**: Optimize based on usage patterns

This maintains your sophisticated blockchain infrastructure while adding wagmi's excellent developer experience for frontend interactions.