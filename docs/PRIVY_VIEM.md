# Privy + Viem Integration

This document shows how to create viem wallet clients from Privy wallets (equivalent to `createEthersFromPrivyWallet` but for viem) and how to organize the implementation within the modular blockchain structure.

## Overview

With Privy wallets, you can create viem `WalletClient` instances that allow you to:
- Read from contracts using the user's wallet
- Write to contracts (send transactions) using the user's wallet
- Sign messages and perform other wallet operations

## Modular Organization

The Privy + Viem integration is organized across the modular blockchain structure as follows:

### **1. Client-Side Privy Integration → `lib/blockchain/providers/`**

#### **`lib/blockchain/providers/privy-viem.ts`** (New)
```typescript
// Client-side Privy wallet integration
import { createWalletClient, createPublicClient, custom, type WalletClient, type PublicClient } from 'viem'
import { type ConnectedWallet } from '@privy-io/react-auth'
import { getClientConfig } from '../config'

export async function createViemFromPrivyWallet(wallet: ConnectedWallet): Promise<WalletClient>
export function createViemPublicClient(): PublicClient
```

#### **`lib/blockchain/providers/viem-provider.ts`** (Update existing empty file)
```typescript
// General viem provider utilities
import { createPublicClient, type PublicClient } from 'viem'
import { getClientConfig } from '../config'

export function createViemPublicClient(): PublicClient
export function createViemWalletClient(): WalletClient | null
```

### **2. Server-Side Integration → `lib/blockchain/config/clients/`**

#### **`lib/blockchain/config/clients/server-client.ts`** (New)
```typescript
// Server-side client creation with private keys
import { createWalletClient, createPublicClient, http, type WalletClient, type PublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { getClientConfig, getClientRpcUrls } from '../core/chain-resolution'
import { validateEnvironment } from '../core/validation'
import { blockchainLogger } from '../../shared/logging-utils'

export function createServerWalletClient(): WalletClient | null
export function createServerPublicClient(): PublicClient
export function getServerAccount()
```

### **3. Business Logic → `lib/blockchain/services/`**

#### **`lib/blockchain/services/privy-operations.ts`** (New)
```typescript
// High-level Privy wallet operations
import { createViemFromPrivyWallet } from '../providers/privy-viem'
import { parseEther } from 'viem'

export async function transferTokens(wallet: ConnectedWallet, to: string, amount: string)
export async function checkBalance(wallet: ConnectedWallet, contractAddress: string)
export async function batchOperations(wallet: ConnectedWallet, operations: Operation[])
```

#### **`lib/blockchain/services/server-operations.ts`** (New)
```typescript
// High-level server operations
import { createServerWalletClient, createServerPublicClient } from '../config/clients/server-client'

export async function batchMintTokens(recipients: Array<{ address: string; amount: string }>)
export async function checkContractState(contractAddress: string)
export async function adminOperations(operations: AdminOperation[])
```

### **4. React Hooks → `hooks/` (Outside blockchain module)**

#### **`hooks/useViemWallet.ts`** (New)
```typescript
// React hook for viem wallet integration
import { useMemo } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { createViemFromPrivyWallet } from '@/lib/blockchain/providers/privy-viem'

export function useViemWallet()
```

#### **`hooks/useLockManagerClient.ts`** (New)
```typescript
// Browser-scoped lock manager helper with coalesced read calls
import { useLockManagerClient } from '@/hooks/useLockManagerClient'

const { checkUserHasValidKey } = useLockManagerClient()
```

This hook wraps the browser-instantiated lock manager service, ensuring
front-end code never touches the server singleton and that repeated status
checks share in-flight requests.

### **5. Updated Index Files**

#### **`lib/blockchain/providers/index.ts`** (Update)
```typescript
// Provider utilities
export * from './provider';           // Existing ethers provider
export * from './privy-viem';         // New Privy integration
export * from './viem-provider';      // General viem utilities
```

#### **`lib/blockchain/config/clients/index.ts`** (Update)
```typescript
// Client creation utilities
export * from './public-client';
export * from './wallet-client';
export * from './account';
export * from './server-client';      // New server-side clients
```

#### **`lib/blockchain/services/index.ts`** (Update)
```typescript
// Business logic services
export * from './grant-key-service';
export * from './lock-manager';
export * from './transaction-service';
export * from './privy-operations';   // New Privy operations
export * from './server-operations';  // New server operations
```

## Benefits of This Organization

### **✅ Clear Separation of Concerns:**
- **Providers** - Low-level client creation
- **Config/Clients** - Configuration-based client creation
- **Services** - High-level business operations
- **Hooks** - React integration (outside blockchain module)

### **✅ Modular and Reusable:**
- **Client-side** - Privy wallet integration
- **Server-side** - Private key operations
- **Business logic** - High-level operations
- **React integration** - Hooks for components

### **✅ Consistent with Existing Structure:**
- **Providers** - Similar to existing `provider.ts`
- **Config/Clients** - Extends existing client modules
- **Services** - Follows existing service pattern
- **Shared utilities** - Uses existing logging and config

### **✅ Usage Examples:**
```typescript
// Client-side (React components)
import { createViemFromPrivyWallet } from '@/lib/blockchain/providers/privy-viem'
import { useViemWallet } from '@/hooks/useViemWallet'

// Server-side (API routes)
import { createServerWalletClient } from '@/lib/blockchain/config/clients/server-client'
import { batchMintTokens } from '@/lib/blockchain/services/server-operations'

// High-level operations
import { transferTokens } from '@/lib/blockchain/services/privy-operations'
```

## Implementation

### 1. Create Utility Function (`lib/blockchain/providers/privy-viem.ts`)

```typescript
import { createWalletClient, createPublicClient, custom, type WalletClient, type PublicClient } from 'viem'
import { type ConnectedWallet } from '@privy-io/react-auth'
import { getClientConfig } from '../config'

/**
 * Create viem wallet client from Privy wallet (equivalent to createEthersFromPrivyWallet)
 */
export async function createViemFromPrivyWallet(
  wallet: ConnectedWallet
): Promise<WalletClient> {
  const config = getClientConfig()

  // Switch to the app's configured chain if needed
  if (wallet.chainId !== `eip155:${config.chainId}`) {
    await wallet.switchChain(config.chainId)
  }

  // Get EIP1193 provider from Privy wallet
  const provider = await wallet.getEthereumProvider()

  // Create viem wallet client
  return createWalletClient({
    account: wallet.address as `0x${string}`,
    chain: config.chain,
    transport: custom(provider),
  })
}

/**
 * Create public client for reads (uses your unified config)
 */
export function createViemPublicClient(): PublicClient {
  const config = getClientConfig()

  return createPublicClient({
    chain: config.chain,
    transport: custom(window.ethereum), // or use your unified transport
  })
}
```

### 2. Usage in Components

```typescript
// components/SomeComponent.tsx
import { useWallets } from '@privy-io/react-auth'
import { createViemFromPrivyWallet } from '@/lib/blockchain/providers/privy-viem'
import { parseEther } from 'viem'

function TransferComponent() {
  const { wallets } = useWallets()
  const wallet = wallets[0] // Primary wallet

  const handleTransfer = async () => {
    if (!wallet) return

    // Create viem wallet client from Privy wallet
    const walletClient = await createViemFromPrivyWallet(wallet)

    // Contract write
    const hash = await walletClient.writeContract({
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
        '0x...', // recipient
        parseEther('1.0') // amount
      ],
    })

    console.log('Transaction hash:', hash)
  }

  const handleRead = async () => {
    if (!wallet) return

    const walletClient = await createViemFromPrivyWallet(wallet)

    // Contract read
    const balance = await walletClient.readContract({
      address: '0x...', // Contract address
      abi: [
        {
          name: 'balanceOf',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: 'account', type: 'address' }],
          outputs: [{ name: '', type: 'uint256' }]
        }
      ],
      functionName: 'balanceOf',
      args: [wallet.address],
    })

    console.log('Balance:', balance.toString())
  }

  return (
    <div>
      <button onClick={handleTransfer}>Transfer Tokens</button>
      <button onClick={handleRead}>Check Balance</button>
    </div>
  )
}
```

### 3. Hook Pattern (Optional)

```typescript
// hooks/useViemWallet.ts
import { useMemo } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { createViemFromPrivyWallet } from '@/lib/blockchain/providers/privy-viem'

export function useViemWallet() {
  const { wallets } = useWallets()
  const wallet = wallets[0]

  const getWalletClient = useMemo(() => {
    if (!wallet) return null
    return () => createViemFromPrivyWallet(wallet)
  }, [wallet])

  return {
    wallet,
    getWalletClient,
    isConnected: !!wallet,
  }
}

// Usage in components
function MyComponent() {
  const { getWalletClient } = useViemWallet()

  const handleTransaction = async () => {
    const walletClient = await getWalletClient?.()
    if (!walletClient) return

    const hash = await walletClient.writeContract({...})
  }
}
```

## Key Features

- **Chain Switching**: Automatically switches to your app's configured chain
- **Type Safety**: Full TypeScript support with proper address typing
- **Error Handling**: Built-in provider validation
- **Unified Config**: Leverages your existing blockchain configuration

## Migration from Ethers

If you're migrating from ethers patterns:

```typescript
// Old ethers pattern
const ethersSigner = await createEthersFromPrivyWallet(wallet)
const contract = new ethers.Contract(address, abi, ethersSigner)
const result = await contract.transfer(to, amount)

// New viem pattern
const walletClient = await createViemFromPrivyWallet(wallet)
const hash = await walletClient.writeContract({
  address,
  abi,
  functionName: 'transfer',
  args: [to, amount]
})
```

## Server-Side Viem with Private Key

For server-side blockchain operations, you'll need a different setup that uses private keys instead of browser wallets.

### 1. Create Server Utility (`lib/blockchain/config/clients/server-client.ts`)

```typescript
import { createWalletClient, createPublicClient, http, type WalletClient, type PublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { getClientConfig, getClientRpcUrls } from '../core/chain-resolution'
import { validateEnvironment } from '../core/validation'
import { blockchainLogger } from '../../shared/logging-utils'

/**
 * Create server-side wallet client with private key
 */
export function createServerWalletClient(): WalletClient | null {
  const privateKey = process.env.LOCK_MANAGER_PRIVATE_KEY

  if (!privateKey) {
    blockchainLogger.warn("Server wallet client unavailable - missing private key")
    return null
  }

  if (!privateKey.startsWith("0x") || privateKey.length !== 66) {
    blockchainLogger.error("Invalid private key format")
    return null
  }

  try {
    const config = getClientConfig()
    const rpcUrls = getClientRpcUrls()
    const account = privateKeyToAccount(privateKey as `0x${string}`)

    return createWalletClient({
      account,
      chain: config.chain,
      transport: http(rpcUrls[0]), // Use primary RPC
    })
  } catch (error) {
    blockchainLogger.error("Failed to create server wallet client", { error })
    return null
  }
}

/**
 * Create server-side public client for reads
 */
export function createServerPublicClient(): PublicClient {
  const config = getClientConfig()
  const rpcUrls = getClientRpcUrls()

  return createPublicClient({
    chain: config.chain,
    transport: http(rpcUrls[0]), // Use primary RPC
  })
}

/**
 * Get server account (without creating full client)
 */
export function getServerAccount() {
  const privateKey = process.env.LOCK_MANAGER_PRIVATE_KEY

  if (!privateKey || !privateKey.startsWith("0x") || privateKey.length !== 66) {
    return null
  }

  try {
    return privateKeyToAccount(privateKey as `0x${string}`)
  } catch (error) {
    blockchainLogger.error("Failed to create server account", { error })
    return null
  }
}
```

### 2. Usage in API Routes

```typescript
// pages/api/admin/mint-tokens.ts
import { createServerWalletClient, createServerPublicClient } from '@/lib/blockchain/config/clients/server-client'
import { parseEther } from 'viem'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Create server wallet client
    const walletClient = createServerWalletClient()
    if (!walletClient) {
      return res.status(500).json({ error: 'Server wallet not configured' })
    }

    // Contract write operation
    const hash = await walletClient.writeContract({
      address: '0x...', // Contract address
      abi: [
        {
          name: 'mint',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ],
          outputs: []
        }
      ],
      functionName: 'mint',
      args: [
        req.body.userAddress,
        parseEther(req.body.amount)
      ],
    })

    // Wait for confirmation (optional)
    const publicClient = createServerPublicClient()
    const receipt = await publicClient.waitForTransactionReceipt({ hash })

    res.json({
      success: true,
      transactionHash: hash,
      status: receipt.status
    })

  } catch (error) {
    console.error('Mint failed:', error)
    res.status(500).json({ error: 'Transaction failed' })
  }
}
```

### 3. Batch Operations

```typescript
// lib/blockchain/services/server-operations.ts
import { createServerWalletClient, createServerPublicClient } from '../config/clients/server-client'

export async function batchMintTokens(recipients: Array<{ address: string; amount: string }>) {
  const walletClient = createServerWalletClient()
  if (!walletClient) throw new Error('Server wallet not configured')

  const promises = recipients.map(({ address, amount }) =>
    walletClient.writeContract({
      address: '0x...', // Contract address
      abi: [...],
      functionName: 'mint',
      args: [address, parseEther(amount)],
    })
  )

  return Promise.all(promises)
}

export async function checkContractState(contractAddress: string) {
  const publicClient = createServerPublicClient()

  const totalSupply = await publicClient.readContract({
    address: contractAddress,
    abi: [...],
    functionName: 'totalSupply',
  })

  return { totalSupply: totalSupply.toString() }
}
```

### 4. Environment Variables

```bash
# .env.local (server-side only)
LOCK_MANAGER_PRIVATE_KEY=0x1234...
```

## Migration Path

### From Monolithic to Modular Structure

If you're migrating from the old monolithic structure:

1. **Update imports** in existing components:
   ```typescript
   // Old
   import { createViemFromPrivyWallet } from '@/lib/blockchain/privy-viem'
   
   // New
   import { createViemFromPrivyWallet } from '@/lib/blockchain/providers/privy-viem'
   ```

2. **Use modular imports** for better tree-shaking:
   ```typescript
   // Import only what you need
   import { createServerWalletClient } from '@/lib/blockchain/config/clients/server-client'
   import { batchMintTokens } from '@/lib/blockchain/services/server-operations'
   ```

3. **Leverage the unified config** system:
   ```typescript
   // All modules use the same configuration
   import { getClientConfig } from '@/lib/blockchain/config'
   ```

## Notes

### Client-Side (Privy Wallets)
- This works with both embedded wallets and external wallets connected through Privy
- The wallet client can sign transactions and messages using the user's wallet
- For read-only operations, consider using the unified public client instead
- Always handle wallet switching and provider errors appropriately
- **Modular Structure**: Client-side integration is now in `providers/` for better organization

### Server-Side (Private Key)
- Uses private key for server-side blockchain operations
- Integrates with your existing blockchain configuration
- Full type safety and error handling
- Suitable for admin operations, automated transactions, and backend services
- **Modular Structure**: Server-side clients are in `config/clients/` and business logic in `services/`

### Benefits of Modular Organization
- **Better maintainability**: Each module has a single responsibility
- **Improved testability**: Modules can be tested in isolation
- **Enhanced reusability**: Components can be imported independently
- **Clearer dependencies**: Import paths clearly show module relationships
- **Future-proof**: Easy to extend and modify individual modules
