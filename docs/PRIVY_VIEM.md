# Privy + Viem Integration

This document shows how to create viem wallet clients from Privy wallets (equivalent to `createEthersFromPrivyWallet` but for viem).

## Overview

With Privy wallets, you can create viem `WalletClient` instances that allow you to:
- Read from contracts using the user's wallet
- Write to contracts (send transactions) using the user's wallet
- Sign messages and perform other wallet operations

## Implementation

### 1. Create Utility Function (`lib/blockchain/privy-viem.ts`)

```typescript
import { createWalletClient, createPublicClient, custom, type WalletClient, type PublicClient } from 'viem'
import { type ConnectedWallet } from '@privy-io/react-auth'
import { getClientConfig } from './config/unified-config'

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
import { createViemFromPrivyWallet } from '@/lib/blockchain/privy-viem'
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
import { createViemFromPrivyWallet } from '@/lib/blockchain/privy-viem'

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

### 1. Create Server Utility (`lib/blockchain/server-viem.ts`)

```typescript
import { createWalletClient, createPublicClient, http, type WalletClient, type PublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { getClientConfig, getClientRpcUrls } from './config/unified-config'
import { blockchainLogger } from './shared/logging-utils'

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
import { createServerWalletClient, createServerPublicClient } from '@/lib/blockchain/server-viem'
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
// lib/blockchain/server-operations.ts
import { createServerWalletClient, createServerPublicClient } from './server-viem'

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

## Notes

### Client-Side (Privy Wallets)
- This works with both embedded wallets and external wallets connected through Privy
- The wallet client can sign transactions and messages using the user's wallet
- For read-only operations, consider using the unified public client instead
- Always handle wallet switching and provider errors appropriately

### Server-Side (Private Key)
- Uses private key for server-side blockchain operations
- Integrates with your existing blockchain configuration
- Full type safety and error handling
- Suitable for admin operations, automated transactions, and backend services