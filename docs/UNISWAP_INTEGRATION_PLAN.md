# Uniswap Frontend Fee Swap Integration — Implementation Plan

> **Status**: Draft v2  
> **Author**: AI Assistant  
> **Date**: 2026-02-16  
> **Complexity**: Medium  

---

## Table of Contents

1. [Overview](#1-overview)  
2. [Technical Context & Constraints](#2-technical-context--constraints)  
3. [Contract Addresses & Constants](#3-contract-addresses--constants)  
4. [Architecture & File Structure](#4-architecture--file-structure)  
5. [Approval Flow: Permit2 (CRITICAL)](#5-approval-flow-permit2-critical)  
6. [Implementation: Step-by-Step](#6-implementation-step-by-step)  
7. [User Flows](#7-user-flows)  
8. [Component Integration](#8-component-integration)  
9. [Environment Variables](#9-environment-variables)  
10. [Error Handling](#10-error-handling)  
11. [Test Cases](#11-test-cases)  
12. [Security Considerations](#12-security-considerations)  
13. [Open Questions & Decisions](#13-open-questions--decisions)  

---

## 1. Overview

### Goal
Integrate Uniswap V3 token swapping (ETH/UP and ETH/USDC on Base) into the existing Vendor page, with a **frontend fee** (e.g. 0.25%) collected on every swap and sent to a project treasury wallet.

### Key Constraints
- **No custom contract deployment**: Use the existing Uniswap **Universal Router** and **Permit2** contracts already deployed on Base.
- **Atomic fee collection**: The fee is split from the swap output in the same transaction the user signs — no separate transaction or trust assumption.
- **Consistent with existing codebase patterns**: Use Privy wallets via `usePrivyWriteWallet`, Viem for contract interaction, and the existing `useTokenApproval` pattern.

### Why Universal Router (Not SwapRouter02)
The existing `uniswap-buyer` scripts use `SwapRouter02` (`0x2626664c...`). This router calls `exactInputSingle` which sends ALL output to a single `recipient`. There is **no built-in way to split output** to both the user AND a fee wallet without a custom contract.

The **Universal Router** solves this with a command-based architecture:
1. `V3_SWAP_EXACT_IN` — execute the swap, send output to the **Router itself** temporarily.
2. `PAY_PORTION` — send X basis points of the Router's held balance to your fee wallet.
3. `SWEEP` — send the remaining balance to the user.

All three happen in **one atomic transaction**.

---

## 2. Technical Context & Constraints

### Existing Tech Stack (p2einferno-app)
| Layer | Technology |
|---|---|
| Framework | Next.js 16 (Pages Router) |
| Blockchain Client | Viem `^2.38.0` |
| Wallet Hooks | Wagmi `^3.0.1` + Privy `@privy-io/react-auth ^2.12.0` |
| Write Transactions | `usePrivyWriteWallet()` → `createViemFromPrivyWallet()` → `walletClient.writeContract()` |
| Token Approval | `useTokenApproval` hook (ERC20 `approve` via Privy wallet) |
| Network | Base Sepolia (default, `NEXT_PUBLIC_BLOCKCHAIN_NETWORK`), Base Mainnet supported |
| Styling | Tailwind CSS |

### What the `uniswap-buyer` Code Provides (Reference Only)
The scripts in `~/Documents/projects/uniswap-buyer` are **backend scripts** using `ethers@6` with a raw private key. They **cannot** be copy-pasted into the React app. However, they provide validated:
- Pool addresses for ETH/UP and ETH/USDC on Base Mainnet.
- Quoter V2 address and ABI.
- SwapRouter02 ABI (useful reference for Universal Router ABI structure).
- Tested swap parameter construction logic.

### Important: What Changes for the Frontend
| uniswap-buyer (scripts) | p2einferno-app (frontend) |
|---|---|
| `ethers.Wallet(PKEY)` | `usePrivyWriteWallet()` → Privy-managed wallet |
| `ethers.Contract().exactInputSingle()` | `walletClient.writeContract()` or `walletClient.sendTransaction()` |
| `SwapRouter02` | **Universal Router** (for fee splitting) |
| Direct `approve()` calls | **Permit2** flow (one-time approve to Permit2, then off-chain signatures) OR traditional ERC20 approvals |
| Server-side, blocks until receipt | Client-side, async with loading states |

---

## 3. Contract Addresses & Constants

### Base Mainnet (Chain ID: 8453)
| Contract | Address | Notes |
|---|---|---|
| Universal Router | `0x66a9893cc07d91d95644aedd05d03f95e1dba8af` | V4 Universal Router |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | Canonical across all chains |
| QuoterV2 | `0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a` | Same as uniswap-buyer |
| WETH | `0x4200000000000000000000000000000000000006` | Base wrapped ETH |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Native USDC on Base |
| UP Token | *(from pool discovery)* | Determined from pool contract |
| ETH/UP Pool | `0x9EF81F4E2F2f15Ff1c0C3f8c9ECc636580025242` | From uniswap-buyer |
| ETH/USDC Pool | `0xd0b53D9277642d899DF5C87A3966A349A798F224` | From uniswap-buyer |

### Base Sepolia (Chain ID: 84532) — Development
| Contract | Address | Notes |
|---|---|---|
| Universal Router | `0x492E6456D9528771018DeB9E87ef7750EF184104` | Verify on testnet explorer |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | Same canonical address |
| QuoterV2 | TBD — verify deployment | May differ from mainnet |
| WETH | `0x4200000000000000000000000000000000000006` | Same address on Base Sepolia |
| ETH/UP Pool | TBD — may not exist on Sepolia | Likely need to test on mainnet fork |
| ETH/USDC Pool | TBD — verify existence | |

> **⚠️ CRITICAL**: Your app defaults to `BASE_SEPOLIA`. The Uniswap pools (ETH/UP, ETH/USDC) may **not** exist on Sepolia. You will likely need to:
> 1. Test against a **Base Mainnet fork** (using Alchemy/Infura forking), OR
> 2. Deploy test pools on Sepolia, OR
> 3. Only enable the Uniswap swap feature when `NEXT_PUBLIC_BLOCKCHAIN_NETWORK=base` (mainnet).
> This is a key decision (see [Open Questions](#13-open-questions--decisions)).

---

## 4. Architecture & File Structure

### New Files

```
lib/uniswap/
├── constants.ts          # Contract addresses, pool configs, fee settings
├── pool.ts               # Pool state fetching (sqrtPriceX96, liquidity, tick)
├── quote.ts              # QuoterV2 integration for price quotes
├── encode-swap.ts        # Universal Router command encoding (SWAP + PAY_PORTION + SWEEP)
├── permit2.ts            # Permit2 approval helpers (check allowance, approve, sign permit)
└── types.ts              # Shared TypeScript types

hooks/vendor/
└── useUniswapSwap.ts     # Main React hook: quotes, approvals, execution

components/vendor/
└── UniswapSwap.tsx        # Swap card UI component

lib/uniswap/abi/
├── universal-router.ts   # Minimal Universal Router ABI (execute function)
├── quoter-v2.ts          # QuoterV2 ABI (copy from uniswap-buyer/ABI/quoter.ts)
├── permit2.ts            # Permit2 ABI (approve, allowance)
└── pool.ts               # IUniswapV3Pool ABI (slot0, liquidity, fee, token0, token1)
```

### Files to Modify

| File | Change |
|---|---|
| `pages/lobby/vendor.tsx` | Import and render `<UniswapSwap />` alongside `<VendorSwap />` |
| `package.json` | Add SDK dependencies |
| `.env.local` / `.env.example` | Add fee wallet address and Uniswap-specific env vars |

---

## 5. Approval Flow: Permit2 (CRITICAL)

### ⚠️ This Is the #1 Source of Bugs

The Universal Router does **NOT** accept direct ERC20 `transferFrom` calls. It uses **Permit2** for token transfers. This means the existing `useTokenApproval` hook's `approve(spender, amount)` pattern **cannot be used directly** with the Universal Router.

### Two-Step Approval Flow

**Step A: One-time ERC20 Approval to Permit2 Contract**
```
User → ERC20.approve(PERMIT2_ADDRESS, type(uint256).max)
```
This is a standard ERC20 `approve` call. The user approves the **Permit2 contract** (not the Universal Router) to spend their tokens. This only needs to happen once per token.

> ✅ Your existing `useTokenApproval.approveIfNeeded()` hook can handle this — just pass `spenderAddress: PERMIT2_ADDRESS` instead of the router address.

**Step B: Permit2 Allowance to Universal Router (per-transaction or batched)**
```
User → Permit2.approve(UNIVERSAL_ROUTER_ADDRESS, amount, expiration)
```
This tells Permit2 that the Universal Router is allowed to pull tokens on the user's behalf.

> This is a second on-chain transaction. Alternatively, the Universal Router SDK can encode a `PERMIT2_PERMIT` command into the same batch, allowing the user to sign an off-chain EIP-712 typed message and include it in the swap transaction itself (gasless permit).

### Recommended Implementation for Simplicity (KISS)

For the **simplest** implementation that avoids EIP-712 signing complexity with Privy wallets:

1. **Check** if `Permit2.allowance(user, token, universalRouter)` returns sufficient allowance.
2. **If not**: Call `Permit2.approve(universalRouter, amount, expiration)` as an on-chain transaction.
3. **Also check** if the token has approved the Permit2 contract: `ERC20.allowance(user, permit2)`.
4. **If not**: Call `ERC20.approve(permit2, MAX_UINT160)` as an on-chain transaction.

This results in up to 2 approval transactions the first time, then 0 approvals for subsequent swaps (assuming sufficient allowance/expiration).

### Native ETH: No Approvals Needed
When swapping **ETH → Token**, the user sends ETH as `msg.value`. The Universal Router has a `WRAP_ETH` command that wraps it inline. **No ERC20 approval or Permit2 flow is needed.** This is a major UX win.

### Approval Decision Matrix

| Swap Direction | Approval Required? |
|---|---|
| ETH → UP | ❌ No (send ETH as value, Router wraps) |
| ETH → USDC | ❌ No (send ETH as value, Router wraps) |
| UP → ETH | ✅ Yes (Permit2 flow for UP token) |
| USDC → ETH | ✅ Yes (Permit2 flow for USDC token) |
| UP → USDC | ✅ Yes (Permit2 flow for UP token) |
| USDC → UP | ✅ Yes (Permit2 flow for USDC token) |

---

## 6. Implementation: Step-by-Step

### Step 1: Install Dependencies

```bash
npm install @uniswap/universal-router-sdk @uniswap/v3-sdk @uniswap/sdk-core @uniswap/router-sdk
```

> **Note**: Verify version compatibility with your existing `ethers@6` and `viem@2.38`. The Uniswap SDKs may have peer dependencies. Check for conflicts.

### Step 2: Create Constants (`lib/uniswap/constants.ts`)

```typescript
/**
 * Uniswap Integration Constants
 * All contract addresses and fee configuration for Uniswap V3 on Base.
 */

export const UNISWAP_ADDRESSES = {
  // Base Mainnet (8453)
  8453: {
    universalRouter: '0x66a9893cc07d91d95644aedd05d03f95e1dba8af' as `0x${string}`,
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as `0x${string}`,
    quoterV2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' as `0x${string}`,
    weth: '0x4200000000000000000000000000000000000006' as `0x${string}`,
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
    pools: {
      ETH_UP: '0x9EF81F4E2F2f15Ff1c0C3f8c9ECc636580025242' as `0x${string}`,
      ETH_USDC: '0xd0b53D9277642d899DF5C87A3966A349A798F224' as `0x${string}`,
    },
  },
  // Base Sepolia (84532) — verify these exist
  84532: {
    universalRouter: '0x492E6456D9528771018DeB9E87ef7750EF184104' as `0x${string}`,
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as `0x${string}`,
    quoterV2: '' as `0x${string}`, // TBD: verify deployment
    weth: '0x4200000000000000000000000000000000000006' as `0x${string}`,
    usdc: '' as `0x${string}`, // TBD: Sepolia USDC address
    pools: {
      ETH_UP: '' as `0x${string}`, // TBD: may not exist
      ETH_USDC: '' as `0x${string}`, // TBD: may not exist
    },
  },
} as const;

/** Frontend fee configuration */
export const FEE_CONFIG = {
  /** Fee in basis points (25 = 0.25%) */
  feeBips: 25,
  /** Fee recipient wallet address — from env var */
  feeRecipient: process.env.NEXT_PUBLIC_UNISWAP_FEE_WALLET as `0x${string}`,
} as const;

/** Default slippage tolerance in basis points */
export const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%

/** Transaction deadline in seconds */
export const DEFAULT_DEADLINE_SECONDS = 600; // 10 minutes
```

### Step 3: Pool State Fetcher (`lib/uniswap/pool.ts`)

```typescript
/**
 * Fetches on-chain pool state from a Uniswap V3 pool contract.
 * Used to build the Pool SDK object for route calculation.
 */

import type { PublicClient } from 'viem';
import { UNISWAP_V3_POOL_ABI } from './abi/pool';

export interface PoolState {
  token0: `0x${string}`;
  token1: `0x${string}`;
  fee: number;
  liquidity: bigint;
  sqrtPriceX96: bigint;
  tick: number;
}

export async function fetchPoolState(
  publicClient: PublicClient,
  poolAddress: `0x${string}`,
): Promise<PoolState> {
  const [token0, token1, fee, liquidity, slot0] = await Promise.all([
    publicClient.readContract({ address: poolAddress, abi: UNISWAP_V3_POOL_ABI, functionName: 'token0' }),
    publicClient.readContract({ address: poolAddress, abi: UNISWAP_V3_POOL_ABI, functionName: 'token1' }),
    publicClient.readContract({ address: poolAddress, abi: UNISWAP_V3_POOL_ABI, functionName: 'fee' }),
    publicClient.readContract({ address: poolAddress, abi: UNISWAP_V3_POOL_ABI, functionName: 'liquidity' }),
    publicClient.readContract({ address: poolAddress, abi: UNISWAP_V3_POOL_ABI, functionName: 'slot0' }),
  ]);

  return {
    token0: token0 as `0x${string}`,
    token1: token1 as `0x${string}`,
    fee: Number(fee),
    liquidity: liquidity as bigint,
    sqrtPriceX96: (slot0 as any)[0] as bigint,
    tick: Number((slot0 as any)[1]),
  };
}
```

### Step 4: Quote Fetcher (`lib/uniswap/quote.ts`)

```typescript
/**
 * Fetches price quotes from Uniswap V3 QuoterV2.
 * Uses staticCall (view) — no gas cost.
 */

import type { PublicClient } from 'viem';
import { QUOTER_V2_ABI } from './abi/quoter-v2';

export interface QuoteResult {
  amountOut: bigint;
  sqrtPriceX96After: bigint;
  initializedTicksCrossed: number;
  gasEstimate: bigint;
}

export async function getQuoteExactInputSingle(
  publicClient: PublicClient,
  quoterAddress: `0x${string}`,
  params: {
    tokenIn: `0x${string}`;
    tokenOut: `0x${string}`;
    fee: number;
    amountIn: bigint;
  },
): Promise<QuoteResult> {
  const result = await publicClient.simulateContract({
    address: quoterAddress,
    abi: QUOTER_V2_ABI,
    functionName: 'quoteExactInputSingle',
    args: [{
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      fee: params.fee,
      amountIn: params.amountIn,
      sqrtPriceLimitX96: 0n,
    }],
  });

  const [amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate] =
    result.result as [bigint, bigint, number, bigint];

  return { amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate };
}
```

### Step 5: Universal Router Command Encoder (`lib/uniswap/encode-swap.ts`)

This is the core of the fee implementation. There are two approaches — choose based on SDK compatibility:

#### Approach A: Using the `@uniswap/universal-router-sdk` (Preferred if SDK works)

```typescript
import { SwapRouter, UniswapTrade } from '@uniswap/universal-router-sdk';
import { Trade as V3Trade } from '@uniswap/v3-sdk';

// The SDK's SwapRouter.swapERC20CallParameters() supports a `fee` option
// that automatically inserts PAY_PORTION + SWEEP commands.
export function encodeSwapWithFee(config: {
  trade: V3Trade<any, any, any>;
  slippageTolerance: Percent;
  deadline: number;
  recipient: string;
  feeRecipient: string;
  feeBips: number;
}): { calldata: string; value: string } {
  // Check SDK docs for exact API — this varies by version
  const { calldata, value } = SwapRouter.swapCallParameters(
    new UniswapTrade(config.trade, {
      fee: {
        fee: new Percent(config.feeBips, 10_000),
        recipient: config.feeRecipient,
      },
      recipient: config.recipient,
      slippageTolerance: config.slippageTolerance,
      deadlineOrPreviousBlockhash: config.deadline,
    })
  );

  return { calldata, value };
}
```

#### Approach B: Manual ABI Encoding (Fallback if SDK has compatibility issues)

If the SDK has peer dependency conflicts or doesn't export the expected API, encode the commands manually using Viem:

```typescript
import { encodePacked, encodeAbiParameters, parseAbiParameters } from 'viem';

/** Command byte constants from the Universal Router */
const COMMAND = {
  V3_SWAP_EXACT_IN: 0x00,
  PAY_PORTION: 0x06,
  SWEEP: 0x04,
  WRAP_ETH: 0x0b,
  UNWRAP_WETH: 0x0c,
} as const;

const ROUTER_AS_RECIPIENT = '0x0000000000000000000000000000000000000002';
const MSG_SENDER = '0x0000000000000000000000000000000000000001';

export function encodeSwapWithFeeManual(config: {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  fee: number;
  amountIn: bigint;
  amountOutMin: bigint;
  recipient: `0x${string}`;
  feeRecipient: `0x${string}`;
  feeBips: number;
  isNativeEthIn: boolean;
  deadline: number;
}): { calldata: `0x${string}`; value: bigint } {
  const commands: number[] = [];
  const inputs: `0x${string}`[] = [];

  // If paying with native ETH, wrap it first
  if (config.isNativeEthIn) {
    commands.push(COMMAND.WRAP_ETH);
    inputs.push(encodeAbiParameters(
      parseAbiParameters('address recipient, uint256 amountMin'),
      [ROUTER_AS_RECIPIENT, config.amountIn]
    ) as `0x${string}`);
  }

  // 1. V3_SWAP_EXACT_IN — output goes to Router
  const path = encodePacked(
    ['address', 'uint24', 'address'],
    [config.tokenIn, config.fee, config.tokenOut]
  );
  commands.push(COMMAND.V3_SWAP_EXACT_IN);
  inputs.push(encodeAbiParameters(
    parseAbiParameters('address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, bool payerIsUser'),
    [ROUTER_AS_RECIPIENT, config.amountIn, config.amountOutMin, path, !config.isNativeEthIn]
  ) as `0x${string}`);

  // 2. PAY_PORTION — send fee% to fee wallet
  commands.push(COMMAND.PAY_PORTION);
  inputs.push(encodeAbiParameters(
    parseAbiParameters('address token, address recipient, uint256 bips'),
    [config.tokenOut, config.feeRecipient, BigInt(config.feeBips)]
  ) as `0x${string}`);

  // 3. SWEEP — send remaining to user
  commands.push(COMMAND.SWEEP);
  inputs.push(encodeAbiParameters(
    parseAbiParameters('address token, address recipient, uint256 amountMin'),
    [config.tokenOut, config.recipient, 0n]
  ) as `0x${string}`);

  // Encode the execute(bytes,bytes[],uint256) call
  const commandBytes = `0x${commands.map(c => c.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
  const calldata = encodeAbiParameters(
    parseAbiParameters('bytes commands, bytes[] inputs, uint256 deadline'),
    [commandBytes, inputs, BigInt(config.deadline)]
  ) as `0x${string}`;

  // Prepend the function selector for execute(bytes,bytes[],uint256)
  const EXECUTE_SELECTOR = '0x3593564c'; // keccak256("execute(bytes,bytes[],uint256)")
  const finalCalldata = `${EXECUTE_SELECTOR}${calldata.slice(2)}` as `0x${string}`;

  return {
    calldata: finalCalldata,
    value: config.isNativeEthIn ? config.amountIn : 0n,
  };
}
```

> **⚠️ Implementation Note**: The exact command byte values (`0x00`, `0x04`, `0x06`, `0x0b`) **must be verified** against the deployed Universal Router version on Base. These values come from the Universal Router's `Commands.sol` library. Use the [Uniswap GitHub](https://github.com/Uniswap/universal-router/blob/main/contracts/libraries/Commands.sol) as the source of truth.

### Step 6: Permit2 Helpers (`lib/uniswap/permit2.ts`)

```typescript
import type { PublicClient, WalletClient } from 'viem';
import { PERMIT2_ABI } from './abi/permit2';
import { ERC20_ABI } from '@/lib/blockchain/shared/abi-definitions';

const MAX_UINT160 = (1n << 160n) - 1n;
const MAX_UINT48 = (1n << 48n) - 1n;

/**
 * Check if the user has approved the Permit2 contract for a given token
 */
export async function checkErc20ApprovalForPermit2(
  publicClient: PublicClient,
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  permit2Address: `0x${string}`,
): Promise<bigint> {
  return publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [ownerAddress, permit2Address],
  }) as Promise<bigint>;
}

/**
 * Check if Permit2 has granted allowance to the Universal Router
 */
export async function checkPermit2Allowance(
  publicClient: PublicClient,
  permit2Address: `0x${string}`,
  ownerAddress: `0x${string}`,
  tokenAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
): Promise<{ amount: bigint; expiration: number; nonce: number }> {
  const result = await publicClient.readContract({
    address: permit2Address,
    abi: PERMIT2_ABI,
    functionName: 'allowance',
    args: [ownerAddress, tokenAddress, spenderAddress],
  });
  const [amount, expiration, nonce] = result as [bigint, number, number];
  return { amount, expiration, nonce };
}

/**
 * Approve Permit2 to spend user's tokens (one-time per token)
 */
export async function approveTokenForPermit2(
  walletClient: WalletClient,
  tokenAddress: `0x${string}`,
  permit2Address: `0x${string}`,
): Promise<`0x${string}`> {
  return walletClient.writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [permit2Address, MAX_UINT160],
    chain: walletClient.chain,
    account: walletClient.account!,
  });
}

/**
 * Grant Permit2 allowance for the Universal Router to pull tokens
 */
export async function approveUniversalRouterViaPermit2(
  walletClient: WalletClient,
  permit2Address: `0x${string}`,
  tokenAddress: `0x${string}`,
  routerAddress: `0x${string}`,
  amount: bigint,
): Promise<`0x${string}`> {
  return walletClient.writeContract({
    address: permit2Address,
    abi: PERMIT2_ABI,
    functionName: 'approve',
    args: [tokenAddress, routerAddress, amount, Number(MAX_UINT48)],
    chain: walletClient.chain,
    account: walletClient.account!,
  });
}
```

### Step 7: Main React Hook (`hooks/vendor/useUniswapSwap.ts`)

```typescript
"use client";

import { useState, useCallback, useMemo } from 'react';
import { usePrivyWriteWallet } from '@/hooks/unlock/usePrivyWriteWallet';
import { createViemFromPrivyWallet } from '@/lib/blockchain/providers/privy-viem';
import { getClientConfig } from '@/lib/blockchain/config';
import { UNISWAP_ADDRESSES, FEE_CONFIG, DEFAULT_SLIPPAGE_BPS, DEFAULT_DEADLINE_SECONDS } from '@/lib/uniswap/constants';
import { fetchPoolState } from '@/lib/uniswap/pool';
import { getQuoteExactInputSingle } from '@/lib/uniswap/quote';
import { encodeSwapWithFeeManual } from '@/lib/uniswap/encode-swap';
import {
  checkErc20ApprovalForPermit2,
  checkPermit2Allowance,
  approveTokenForPermit2,
  approveUniversalRouterViaPermit2,
} from '@/lib/uniswap/permit2';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('hooks:vendor:uniswap-swap');

export type SwapPair = 'ETH_UP' | 'ETH_USDC';
export type SwapDirection = 'buy' | 'sell'; // buy = ETH→Token, sell = Token→ETH

interface SwapQuote {
  amountOut: bigint;
  feeAmount: bigint;     // portion going to fee wallet
  userReceives: bigint;   // amountOut - feeAmount
  priceImpact: number;    // percentage
  gasEstimate: bigint;
}

interface SwapState {
  quote: SwapQuote | null;
  isQuoting: boolean;
  isApproving: boolean;
  isSwapping: boolean;
  error: string | null;
  txHash: string | null;
}

export function useUniswapSwap() {
  const wallet = usePrivyWriteWallet();
  const { chainId } = getClientConfig();

  const [state, setState] = useState<SwapState>({
    quote: null,
    isQuoting: false,
    isApproving: false,
    isSwapping: false,
    error: null,
    txHash: null,
  });

  const addresses = useMemo(() => {
    const addrs = UNISWAP_ADDRESSES[chainId as keyof typeof UNISWAP_ADDRESSES];
    if (!addrs) {
      log.warn('No Uniswap addresses configured for chain', { chainId });
      return null;
    }
    return addrs;
  }, [chainId]);

  /**
   * Fetch a quote for the given swap
   */
  const getQuote = useCallback(async (
    pair: SwapPair,
    direction: SwapDirection,
    amountIn: bigint,
  ): Promise<SwapQuote | null> => {
    if (!addresses) return null;

    setState(prev => ({ ...prev, isQuoting: true, error: null }));

    try {
      const { publicClient } = await createViemFromPrivyWallet(wallet!);
      const poolAddress = addresses.pools[pair];
      const poolState = await fetchPoolState(publicClient, poolAddress);

      const tokenIn = direction === 'buy' ? addresses.weth : /* resolve from pool */ poolState.token0;
      const tokenOut = direction === 'buy' ? /* resolve from pool */ poolState.token1 : addresses.weth;

      const quoteResult = await getQuoteExactInputSingle(
        publicClient,
        addresses.quoterV2,
        { tokenIn, tokenOut, fee: poolState.fee, amountIn },
      );

      const feeAmount = (quoteResult.amountOut * BigInt(FEE_CONFIG.feeBips)) / 10_000n;
      const userReceives = quoteResult.amountOut - feeAmount;

      const quote: SwapQuote = {
        amountOut: quoteResult.amountOut,
        feeAmount,
        userReceives,
        priceImpact: 0, // TODO: Calculate from sqrtPriceX96After vs current
        gasEstimate: quoteResult.gasEstimate,
      };

      setState(prev => ({ ...prev, quote, isQuoting: false }));
      return quote;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Quote failed';
      log.error('Quote failed', { err });
      setState(prev => ({ ...prev, isQuoting: false, error: msg }));
      return null;
    }
  }, [wallet, addresses]);

  /**
   * Execute the swap with fee
   */
  const executeSwap = useCallback(async (
    pair: SwapPair,
    direction: SwapDirection,
    amountIn: bigint,
    amountOutMin: bigint,
  ) => {
    if (!wallet || !addresses || !FEE_CONFIG.feeRecipient) {
      setState(prev => ({ ...prev, error: 'Wallet or config not ready' }));
      return;
    }

    setState(prev => ({ ...prev, isSwapping: true, error: null, txHash: null }));

    try {
      const { walletClient, publicClient } = await createViemFromPrivyWallet(wallet);
      const userAddress = wallet.address as `0x${string}`;
      const poolAddress = addresses.pools[pair];
      const poolState = await fetchPoolState(publicClient, poolAddress);
      const isNativeEthIn = direction === 'buy';

      const tokenIn = isNativeEthIn ? addresses.weth : /* from pool */ poolState.token0;
      const tokenOut = isNativeEthIn ? /* from pool */ poolState.token1 : addresses.weth;

      // --- Handle Approvals (only for ERC20 → ETH direction) ---
      if (!isNativeEthIn) {
        setState(prev => ({ ...prev, isApproving: true }));

        // Step A: ERC20 → Permit2
        const erc20Allowance = await checkErc20ApprovalForPermit2(
          publicClient, tokenIn, userAddress, addresses.permit2,
        );
        if (erc20Allowance < amountIn) {
          log.info('Approving token for Permit2');
          const approveTx = await approveTokenForPermit2(walletClient, tokenIn, addresses.permit2);
          await publicClient.waitForTransactionReceipt({ hash: approveTx });
        }

        // Step B: Permit2 → Universal Router
        const permit2Allowance = await checkPermit2Allowance(
          publicClient, addresses.permit2, userAddress, tokenIn, addresses.universalRouter,
        );
        if (permit2Allowance.amount < amountIn) {
          log.info('Approving Universal Router via Permit2');
          const permit2Tx = await approveUniversalRouterViaPermit2(
            walletClient, addresses.permit2, tokenIn, addresses.universalRouter, amountIn,
          );
          await publicClient.waitForTransactionReceipt({ hash: permit2Tx });
        }

        setState(prev => ({ ...prev, isApproving: false }));
      }

      // --- Encode and Send Swap ---
      const deadline = Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS;
      const { calldata, value } = encodeSwapWithFeeManual({
        tokenIn,
        tokenOut,
        fee: poolState.fee,
        amountIn,
        amountOutMin,
        recipient: userAddress,
        feeRecipient: FEE_CONFIG.feeRecipient,
        feeBips: FEE_CONFIG.feeBips,
        isNativeEthIn,
        deadline,
      });

      const txHash = await walletClient.sendTransaction({
        to: addresses.universalRouter,
        data: calldata,
        value,
        chain: walletClient.chain,
        account: walletClient.account ?? userAddress,
      });

      log.info('Swap transaction submitted', { txHash });
      setState(prev => ({ ...prev, txHash, isSwapping: false }));

      // Wait for confirmation
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      log.info('Swap confirmed', { txHash });

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Swap failed';
      log.error('Swap execution failed', { err });
      setState(prev => ({ ...prev, isSwapping: false, isApproving: false, error: msg }));
    }
  }, [wallet, addresses]);

  return {
    ...state,
    getQuote,
    executeSwap,
    isSupported: !!addresses,
    feeBips: FEE_CONFIG.feeBips,
  };
}
```

### Step 8: UI Component (`components/vendor/UniswapSwap.tsx`)

The component should:
- Mirror the `VendorSwap.tsx` design language (dark card, mode toggle, amount input).
- Add a **pair selector** (ETH/UP vs ETH/USDC).
- Show the fee breakdown (app fee, output after fee).
- Provide clear approval step indicators.

**Design structure** (not full implementation — follow `VendorSwap.tsx` patterns):

```tsx
export default function UniswapSwap() {
  // 1. State: pair, direction, amount
  // 2. Hook: useUniswapSwap()
  // 3. Debounced quote fetching on amount change
  // 4. UI Sections:
  //    a. Header: "Uniswap Swap" with pair selector pills
  //    b. Direction toggle: Buy / Sell
  //    c. Amount input with balance display
  //    d. Quote display card:
  //       - Exchange rate
  //       - App fee (0.25%)
  //       - Min received after fee
  //       - Price impact warning (if > 1%)
  //    e. Action button (Approve → Swap, with loading states)

  return (
    <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-slate-900/90 to-slate-900/60 p-6 shadow-2xl shadow-black/40 space-y-4">
      {/* ... match VendorSwap styling ... */}
    </div>
  );
}
```

### Step 9: Vendor Page Integration (`pages/lobby/vendor.tsx`)

```tsx
import UniswapSwap from '@/components/vendor/UniswapSwap';

export default function VendorPage() {
  return (
    <LobbyLayout>
      <div className="flex flex-col items-center py-8">
        {/* ... existing header ... */}

        <section className="w-full max-w-5xl mx-auto mt-8 px-4 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-center">
          {/* Primary: DG Vendor swap (existing) */}
          <div className="w-full lg:max-w-md">
            <VendorSwap />
          </div>

          {/* New: Uniswap swap card */}
          <div className="w-full lg:max-w-md">
            <UniswapSwap />
          </div>

          {/* Side info column */}
          <div className="w-full lg:max-w-sm space-y-6">
            <LightUpButton />
            <LevelUpCard />
          </div>
        </section>
      </div>
    </LobbyLayout>
  );
}
```

> **Layout Decision**: This places the Uniswap card side-by-side with the Vendor card. Alternatively, use tabs within a single card to toggle between "DG Market" and "Uniswap". See [Open Questions](#13-open-questions--decisions).

---

## 7. User Flows

### Flow 1: ETH → UP (Buy UP with ETH) — Happiest Path
```
User lands on Vendor page
  → Selects "ETH/UP" pair, "Buy" direction
  → Enters 0.01 ETH
  → App fetches quote: "You will receive ~1,250 UP (0.25% fee: 3.125 UP to app)"
  → User clicks "Swap"
  → Single transaction signed (ETH sent as msg.value, no approval needed)
  → Universal Router: WRAP_ETH → V3_SWAP → PAY_PORTION → SWEEP
  → User receives ~1,246.875 UP
  → Fee wallet receives ~3.125 UP
  → Toast: "Swap complete! View on BaseScan"
```

### Flow 2: UP → ETH (Sell UP for ETH) — Approval Required
```
User selects "ETH/UP" pair, "Sell" direction
  → Enters 1000 UP
  → App fetches quote: "You will receive ~0.008 ETH (fee: 0.00002 ETH)"
  
  First time only:
  → User clicks "Swap"
  → App detects: UP not approved for Permit2
  → Button says "Approve UP" → user signs tx 1
  → App detects: Permit2 not approved for Router
  → Button says "Approve Router" → user signs tx 2
  → Button changes to "Swap" → user signs tx 3
  
  Subsequent times:
  → User clicks "Swap" → single transaction
```

### Flow 3: Error — Insufficient Liquidity
```
User enters 100 ETH (large amount)
  → Quote returns very high price impact (> 5%)
  → UI shows: "⚠️ Price impact too high (12.3%). Consider a smaller amount."
  → Swap button disabled
```

### Flow 4: Error — Stale Quote
```
User gets a quote, waits 3 minutes
  → Price moves significantly
  → User clicks "Swap"
  → Transaction reverts due to amountOutMinimum check
  → Error toast: "Swap failed: output below minimum. Refresh quote and try again."
  → UI refreshes the quote automatically
```

---

## 8. Component Integration

### Debounced Quote Fetching
The quotes should be fetched with a **500ms debounce** on the amount input to avoid excessive RPC calls. Use the pattern:

```typescript
// In UniswapSwap.tsx
useEffect(() => {
  const timeout = setTimeout(() => {
    if (parsedAmount && parsedAmount > 0n) {
      getQuote(pair, direction, parsedAmount);
    }
  }, 500);
  return () => clearTimeout(timeout);
}, [amount, pair, direction]);
```

### Quote Auto-Refresh
Quotes should auto-refresh every **15 seconds** while the user has a valid amount entered, to prevent stale pricing.

### Loading State Progression
The swap button should show progressive states:
1. `"Enter amount"` (disabled, no amount)
2. `"Fetching quote..."` (disabled, during quote)
3. `"Insufficient balance"` (disabled, red)
4. `"Price impact too high"` (disabled, warning)
5. `"Approve [TOKEN]"` (enabled, first-time approval)
6. `"Swap"` (enabled, ready)
7. `"Approving..."` (disabled, during approval tx)
8. `"Swapping..."` (disabled, during swap tx)

---

## 9. Environment Variables

Add to `.env.local` and `.env.example`:

```bash
# === Uniswap Integration ===

# Address that receives the frontend fee on swaps (use a Gnosis Safe or multisig)
NEXT_PUBLIC_UNISWAP_FEE_WALLET=0xYourFeeWalletAddressHere

# Optional: Override fee basis points (default: 25 = 0.25%)
# NEXT_PUBLIC_UNISWAP_FEE_BIPS=25
```

---

## 10. Error Handling

### Error Categories and User Messages

| Error | Cause | User Message | Recovery |
|---|---|---|---|
| `INSUFFICIENT_OUTPUT_AMOUNT` | Price moved, slippage exceeded | "Price changed. Refresh and try again." | Auto-refresh quote |
| `EXPIRED` | Deadline passed | "Transaction expired. Please try again." | Retry |
| `STF` (SafeTransferFrom) | Approval insufficient | "Token approval needed." | Re-trigger approval |
| `InsufficientBalance` | Not enough input tokens | "Insufficient balance." | Show balance |
| User rejected tx | Wallet popup dismissed | "Transaction cancelled." | No action |
| RPC timeout | Network issue | "Network error. Please try again." | Retry |
| Pool not found | Invalid pool address | "This trading pair is not available on this network." | Disable pair |

### Implementation Pattern
Follow the existing `useDGMarket` error handling pattern — return `{ success: boolean, error?: string }` from the hook, and show errors via the existing toast system (`react-hot-toast`).

---

## 11. Test Cases

### Unit Tests

#### `lib/uniswap/encode-swap.test.ts`
| Test | Description |
|---|---|
| `encodes WRAP_ETH command for native ETH input` | Verify WRAP_ETH is first command when `isNativeEthIn=true` |
| `omits WRAP_ETH for ERC20 input` | Verify no WRAP_ETH when `isNativeEthIn=false` |
| `includes PAY_PORTION with correct fee bips` | Verify fee recipient and bips are encoded |
| `includes SWEEP with user address` | Verify user receives remainder |
| `calculates correct value for ETH swaps` | `value` equals `amountIn` for ETH input, `0n` otherwise |
| `generates valid execute selector` | First 4 bytes match `0x3593564c` |

#### `lib/uniswap/permit2.test.ts`
| Test | Description |
|---|---|
| `detects insufficient ERC20 allowance` | Returns false when allowance < amount |
| `detects sufficient Permit2 allowance` | Returns true when amount/expiration are OK |
| `skips approval when allowance sufficient` | No write call made |

#### `lib/uniswap/quote.test.ts`
| Test | Description |
|---|---|
| `returns valid quote for ETH→USDC` | Mock QuoterV2 response, verify parsed output |
| `calculates fee split correctly` | `feeAmount + userReceives == amountOut` |
| `handles zero amount gracefully` | Returns 0 without throwing |

#### `hooks/vendor/useUniswapSwap.test.ts`
| Test | Description |
|---|---|
| `returns isSupported=false for unsupported chain` | When chainId not in UNISWAP_ADDRESSES |
| `fetches quote and updates state` | Mock pool + quoter, verify state.quote |
| `handles approval flow for sell direction` | Verify 2 approval txs are sent before swap |
| `skips approvals for buy (ETH) direction` | No approval calls when buying with ETH |
| `sets error state on failure` | Verify error message on revert |

#### `components/vendor/UniswapSwap.test.tsx`
| Test | Description |
|---|---|
| `renders pair selector` | ETH/UP and ETH/USDC options visible |
| `renders buy/sell toggle` | Both modes accessible |
| `disables swap button when no amount` | Button shows "Enter amount" |
| `shows fee breakdown after quote` | Fee amount and user receive shown |
| `shows approval button for sell mode` | Detect first-time sell flow |

### Integration Tests (Manual / E2E on Fork)
| Test | Description |
|---|---|
| `ETH → UP swap on mainnet fork` | Full end-to-end with Anvil fork, verify fee wallet balance |
| `UP → ETH with approval flow` | Verify Permit2 + Universal Router approval chain |
| `Fee calculation accuracy` | Verify exact fee amount matches `feeBips / 10000 * amountOut` |
| `Slippage protection` | Manipulate pool price, verify revert on exceeded slippage |

---

## 12. Security Considerations

| Risk | Mitigation |
|---|---|
| Fee wallet compromise | Use a Gnosis Safe multisig. Never use a single EOA. |
| Fee percentage manipulation | `FEE_CONFIG.feeBips` is sourced from env vars and hardcoded in the build. Users can inspect but not modify at runtime. |
| Infinite approval to Permit2 | Standard practice (Uniswap, 1inch all do this). Users can revoke via revoke.cash. |
| Stale quotes leading to unfavorable swaps | Enforce amountOutMinimum with user-configured slippage. Auto-refresh quotes. |
| MEV / sandwich attacks | Use tight deadlines (10 min). Consider using Flashbots Protect RPC for mainnet. |
| Front-running the fee | Not exploitable — fee is a fixed percentage encoded in the calldata the user signs. |

---

## 13. Open Questions & Decisions

| # | Question | Options | Recommendation |
|---|---|---|---|
| 1 | **Network support**: Enable on Sepolia or mainnet-only? | (a) Mainnet only (b) Both with feature flag | **(a)** — Pools don't exist on Sepolia. Gate behind `chainId === 8453`. |
| 2 | **Layout**: Side-by-side cards or tabs within one card? | (a) Two separate cards (b) Tabbed interface | **(b)** — Less visual clutter; matches existing VendorSwap UX. |
| 3 | **Supported pairs**: Only ETH/UP and ETH/USDC, or extensible? | (a) Hardcoded 2 pairs (b) Config-driven | **(a)** for MVP — keep it simple. |
| 4 | **Swap directions**: Bidirectional or ETH-to-token only? | (a) Both buy and sell (b) Buy only | **(a)** — Both, but sell requires Permit2 flow. |
| 5 | **Fee percentage**: Fixed or admin-configurable? | (a) Hardcoded in env (b) Admin panel setting | **(a)** for MVP — env var is sufficient. |
| 6 | **SDK vs manual encoding**: Use `@uniswap/universal-router-sdk` or manual Viem encoding? | (a) SDK (b) Manual | **(b)** for reliability — SDK has frequent breaking changes and peer dep issues. Manual encoding with Viem is more predictable. |
| 7 | **Fee token**: Take fee in output token or input token? | (a) Output token (b) Input token | **(a)** — The `PAY_PORTION` command operates on the Router's balance of the output token. |
| 8 | **Price impact threshold**: At what % should we warn/block? | Configurable | Warn at 1%, block at 5%. |
| 9 | **Universal Router version**: V1 (`0x3fC91A3...`) or V2/V4 (`0x66a989...`)? | Verify on BaseScan | The latest deployed version on Base. Verify command byte values match. |
| 10 | **Testing strategy**: Mainnet fork or deploy test pools on Sepolia? | (a) Anvil mainnet fork (b) Sepolia test pools | **(a)** — Much simpler, real liquidity data. |
