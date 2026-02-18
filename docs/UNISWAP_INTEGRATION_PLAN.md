# Uniswap Frontend Fee Swap Integration — Implementation Plan

> **Status**: Draft v7 — includes UP/USDC multi-hop via WETH implementation plan
> **Author**: AI Assistant
> **Date**: 2026-02-18
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
Integrate Uniswap V3 token swapping (ETH/UP, ETH/USDC, and UP/USDC on Base) into the existing Vendor page, with a **frontend fee** (e.g. 0.25%) collected on every swap and sent to a project treasury wallet.

### Key Constraints
- **No custom contract deployment**: Use the existing Uniswap **Universal Router** and **Permit2** contracts already deployed on Base.
- **Atomic fee collection**: The fee is split from the swap output in the same transaction the user signs — no separate transaction or trust assumption.
- **Consistent with existing codebase patterns**: Use Privy wallets via `usePrivyWriteWallet`, Viem for contract interaction, and the existing `useTokenApproval` pattern.
- **Base Mainnet only**: Uniswap routes for ETH/UP, ETH/USDC, and UP/USDC (via WETH) are targeted on Base Mainnet only. The integration will use a dedicated Base Mainnet public client regardless of the app's `NEXT_PUBLIC_BLOCKCHAIN_NETWORK` setting.
- **Manual Viem encoding**: No Uniswap SDK dependencies. All Universal Router calldata is encoded manually using Viem's `encodeAbiParameters` / `encodePacked` — this avoids peer dependency conflicts and SDK breaking changes.
- **Tabbed UI**: The Uniswap swap will be integrated as a tab within the existing Vendor card, not as a separate card.
- **Three hardcoded pairs**:
  - ETH ↔ UP (single-hop)
  - ETH ↔ USDC (single-hop)
  - UP ↔ USDC (**multi-hop via WETH** for MVP reliability)

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
| Write Transactions | `usePrivyWriteWallet()` → `createViemFromPrivyWallet()` → `walletClient.writeContract()`. **Exception**: Uniswap swaps use `ensureWalletOnChainId(provider, { chainId: 8453 })` + manual `createWalletClient({ chain: base })` to guarantee Base Mainnet targeting (see Step 7). |
| Token Approval | `useTokenApproval` hook (ERC20 `approve` via Privy wallet) |
| Network | Base Sepolia (default dev), Base Mainnet (production). **Uniswap integration targets Base Mainnet only.** |
| Base Mainnet Client | `createPublicClientForChain(base)` — creates a dedicated Base Mainnet read client using the app's configured Alchemy/Infura RPC URLs, independent of `NEXT_PUBLIC_BLOCKCHAIN_NETWORK`. This is the same pattern used by the address/network dropdown component. |
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
| Direct `approve()` calls | **Permit2** flow (one-time ERC20 approve to Permit2, then Permit2.approve to Universal Router) |
| Server-side, blocks until receipt | Client-side, async with loading states |
| Any chain | **Base Mainnet only** — uses `createPublicClientForChain(base)` for reads |

---

## 3. Contract Addresses & Constants

### Base Mainnet (Chain ID: 8453)
| Contract | Address | Notes |
|---|---|---|
| Universal Router | `0x6ff5693b99212da76ad316178a184ab56d299b43` | V4 Universal Router **on Base** (verified via [BaseScan](https://basescan.org/address/0x6ff5693b99212da76ad316178a184ab56d299b43)) |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | Canonical across all chains |
| QuoterV2 | `0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a` | Same as uniswap-buyer (verified via [BaseScan](https://basescan.org/address/0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a)) |
| WETH | `0x4200000000000000000000000000000000000006` | Base wrapped ETH |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Native USDC on Base |
| UP Token | `0xaC27fa800955849d6D17cC8952Ba9dD6EAA66187` | Confirmed from uniswap-buyer pool interaction |
| ETH/UP Pool | `0x9EF81F4E2F2f15Ff1c0C3f8c9ECc636580025242` | From uniswap-buyer |
| ETH/USDC Pool | `0xd0b53D9277642d899DF5C87A3966A349A798F224` | From uniswap-buyer |
| UP/USDC Pool (0.3%) | `0x9079070042bc24b4978516706b8b38c77b4f774f` | Exists on-chain but can have zero liquidity |
| UP/USDC Pool (1%) | `0x26fB74bd19Fdb3833F4C05194673A19A85E46b5e` | Exists on-chain but can have zero liquidity |

> **✅ DECIDED**: This integration targets **Base Mainnet only**. The Uniswap hook will create a dedicated `PublicClient` for Base Mainnet (chain ID 8453) using `createPublicClientForChain(base)`, regardless of the app's `NEXT_PUBLIC_BLOCKCHAIN_NETWORK` setting. This is the same pattern used by the network-specific components in the app. Testing will use an **Anvil mainnet fork** for integration tests.

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
└── UniswapSwapTab.tsx      # Swap tab content (rendered inside VendorSwap's tabbed layout)

lib/uniswap/abi/
├── universal-router.ts   # Minimal Universal Router ABI (execute function)
├── quoter-v2.ts          # QuoterV2 ABI (copy from uniswap-buyer/ABI/quoter.ts)
├── permit2.ts            # Permit2 ABI (approve, allowance)
└── pool.ts               # IUniswapV3Pool ABI (slot0, liquidity, fee, token0, token1)
```

### Files to Modify

| File | Change |
|---|---|
| `components/vendor/VendorSwap.tsx` | Add tab navigation ("DG Market" / "Uniswap") wrapping existing content + new `UniswapSwapTab` |
| `pages/lobby/vendor.tsx` | No change needed — `VendorSwap` already rendered here |
| `.env.local` / `.env.example` | Add `NEXT_PUBLIC_UNISWAP_FEE_WALLET` env var |

> **Note**: No new npm dependencies are required. All encoding is done manually with Viem (already installed). The Uniswap SDKs (`@uniswap/universal-router-sdk`, `@uniswap/v3-sdk`, etc.) are **not** needed.

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

**Step B: Permit2 Allowance to Universal Router (one-time per token)**
```
User → Permit2.approve(UNIVERSAL_ROUTER_ADDRESS, MAX_UINT160, MAX_UINT48_EXPIRATION)
```
This tells Permit2 that the Universal Router is allowed to pull tokens on the user's behalf. Using `MAX_UINT160` amount and `MAX_UINT48` expiration ensures this is a **one-time approval** — subsequent swaps of any size will not require re-approval.

> This is a second on-chain transaction. Alternatively, the Universal Router SDK can encode a `PERMIT2_PERMIT` command into the same batch, allowing the user to sign an off-chain EIP-712 typed message and include it in the swap transaction itself (gasless permit). We use the on-chain approach for simplicity with Privy wallets.

### Recommended Implementation for Simplicity (KISS)

For the **simplest** implementation that avoids EIP-712 signing complexity with Privy wallets:

1. **Check** if `Permit2.allowance(user, token, universalRouter)` returns sufficient allowance.
2. **If not**: Call `Permit2.approve(universalRouter, MAX_UINT160, MAX_UINT48)` as an on-chain transaction.
3. **Also check** if the token has approved the Permit2 contract: `ERC20.allowance(user, permit2)`.
4. **If not**: Call `ERC20.approve(permit2, type(uint256).max)` as an on-chain transaction.

This results in up to 2 approval transactions the first time, then **0 approvals for all subsequent swaps** regardless of amount (ERC20 approval uses MAX_UINT256, Permit2 allowance uses MAX_UINT160).

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

### UP/USDC Route Policy (MVP)

- Primary route for UP ↔ USDC is **multi-hop via WETH**:
  - UP → WETH (fee 3000) → USDC (fee 500)
  - USDC → WETH (fee 500) → UP (fee 3000)
- Direct UP/USDC pools (3000, 10000) are defined in constants for monitoring and future optimization.
- If direct pool liquidity becomes reliable, we can add quote comparison (`direct vs viaWETH`) and choose best output. For MVP, force via-WETH to reduce route instability.

---

## 6. Implementation: Step-by-Step

### Step 1: Dependencies

**No new npm packages are needed.** All Universal Router calldata is encoded manually using Viem's built-in `encodeAbiParameters`, `encodePacked`, and `encodeFunctionData` utilities which are already installed (`viem@^2.38.0`).

The QuoterV2 and Pool ABIs will be defined as TypeScript constants in `lib/uniswap/abi/`.

### Step 2: Create Constants (`lib/uniswap/constants.ts`)

```typescript
/**
 * Uniswap Integration Constants
 * All contract addresses and fee configuration for Uniswap V3 on Base.
 */

import { base } from 'viem/chains';

/** Base Mainnet only — no Sepolia support for Uniswap swaps */
export const UNISWAP_CHAIN = base; // chain ID 8453

/** All contract addresses for Base Mainnet */
export const UNISWAP_ADDRESSES = {
  universalRouter: '0x6ff5693b99212da76ad316178a184ab56d299b43' as `0x${string}`,
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as `0x${string}`,
  quoterV2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' as `0x${string}`,
  weth: '0x4200000000000000000000000000000000000006' as `0x${string}`,
  usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
  up: '0xaC27fa800955849d6D17cC8952Ba9dD6EAA66187' as `0x${string}`,
  pools: {
    ETH_UP: '0x9EF81F4E2F2f15Ff1c0C3f8c9ECc636580025242' as `0x${string}`,
    ETH_USDC: '0xd0b53D9277642d899DF5C87A3966A349A798F224' as `0x${string}`,
    UP_USDC_3000: '0x9079070042bc24b4978516706b8b38c77b4f774f' as `0x${string}`,
    UP_USDC_10000: '0x26fB74bd19Fdb3833F4C05194673A19A85E46b5e' as `0x${string}`,
  },
} as const;

/** Supported swap pairs — hardcoded for MVP */
export type SwapPair = 'ETH_UP' | 'ETH_USDC' | 'UP_USDC';

/**
 * Route config for each pair.
 * - single-hop routes use one fee tier
 * - multi-hop routes define an ordered path through intermediate tokens
 */
export const ROUTE_CONFIG = {
  ETH_UP: {
    tokenA: 'ETH',
    tokenB: 'UP',
    kind: 'single',
    fee: 3000,
  },
  ETH_USDC: {
    tokenA: 'ETH',
    tokenB: 'USDC',
    kind: 'single',
    fee: 500,
  },
  UP_USDC: {
    tokenA: 'UP',
    tokenB: 'USDC',
    kind: 'multihop',
    hops: [
      { tokenIn: UNISWAP_ADDRESSES.up, tokenOut: UNISWAP_ADDRESSES.weth, fee: 3000 },
      { tokenIn: UNISWAP_ADDRESSES.weth, tokenOut: UNISWAP_ADDRESSES.usdc, fee: 500 },
    ],
  },
} as const;

/** Frontend fee configuration */
export const FEE_CONFIG = {
  /** Fee in basis points (25 = 0.25%), sourced from env var */
  feeBips: Number(process.env.NEXT_PUBLIC_UNISWAP_FEE_BIPS ?? 25),
  /** Fee recipient wallet address — from env var */
  feeRecipient: process.env.NEXT_PUBLIC_UNISWAP_FEE_WALLET as `0x${string}`,
} as const;

/** Default slippage tolerance in basis points */
export const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%

/** Transaction deadline in seconds (5 min — matches uniswap-buyer manual swap timing) */
export const DEFAULT_DEADLINE_SECONDS = 300; // 5 minutes

/**
 * Resolve which pool token is WETH and which is the "other" token.
 *
 * Uniswap V3 pools order tokens by address (lower address = token0).
 * We MUST compare against the known WETH address — never assume token0/token1 ordering.
 * This mirrors the uniswap-buyer's dynamic detection logic.
 */
export function resolvePoolTokens(
  token0: `0x${string}`,
  token1: `0x${string}`,
): { wethToken: `0x${string}`; otherToken: `0x${string}` } {
  const weth = UNISWAP_ADDRESSES.weth.toLowerCase();
  const isToken0Weth = token0.toLowerCase() === weth;
  const isToken1Weth = token1.toLowerCase() === weth;

  if (!isToken0Weth && !isToken1Weth) {
    throw new Error(
      `Neither pool token matches WETH (${UNISWAP_ADDRESSES.weth}). ` +
      `Got token0=${token0}, token1=${token1}. Check pool address configuration.`
    );
  }

  return {
    wethToken: isToken0Weth ? token0 : token1,
    otherToken: isToken0Weth ? token1 : token0,
  };
}

/**
 * Validate that the fee recipient address is configured.
 * Must be called before any swap execution.
 */
export function validateFeeConfig(): void {
  if (!FEE_CONFIG.feeRecipient || FEE_CONFIG.feeRecipient === 'undefined') {
    throw new Error(
      'NEXT_PUBLIC_UNISWAP_FEE_WALLET is not configured. ' +
      'Set this environment variable to the treasury address before enabling swaps.'
    );
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(FEE_CONFIG.feeRecipient)) {
    throw new Error(
      `NEXT_PUBLIC_UNISWAP_FEE_WALLET is not a valid address: ${FEE_CONFIG.feeRecipient}`
    );
  }
  if (
    Number.isNaN(FEE_CONFIG.feeBips) ||
    !Number.isInteger(FEE_CONFIG.feeBips) ||
    FEE_CONFIG.feeBips < 0 ||
    FEE_CONFIG.feeBips > 10_000
  ) {
    throw new Error(
      `NEXT_PUBLIC_UNISWAP_FEE_BIPS must be an integer 0-10000, got: ${FEE_CONFIG.feeBips}`
    );
  }
}
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

export async function getQuoteExactInput(
  publicClient: PublicClient,
  quoterAddress: `0x${string}`,
  params: {
    path: `0x${string}`;  // encoded as tokenIn,fee,tokenMid,fee,tokenOut...
    amountIn: bigint;
  },
): Promise<QuoteResult> {
  const result = await publicClient.simulateContract({
    address: quoterAddress,
    abi: QUOTER_V2_ABI,
    functionName: 'quoteExactInput',
    args: [params.path, params.amountIn],
  });

  const [amountOut, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate] =
    result.result as [bigint, bigint[], number[], bigint];

  // For multi-hop routes, we expose the last-hop post-swap sqrtPrice for analytics only.
  const sqrtPriceX96After = sqrtPriceX96AfterList[sqrtPriceX96AfterList.length - 1] ?? 0n;
  const initializedTicksCrossed =
    initializedTicksCrossedList.reduce((acc, v) => acc + v, 0);

  return { amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate };
}
```

### Step 5: Universal Router Command Encoder (`lib/uniswap/encode-swap.ts`)

This is the core of the fee implementation. We use **manual Viem encoding** (no Uniswap SDK dependency) for reliability and zero dependency issues:

#### Path Builder Rules (Single-hop + Multi-hop)

- Single-hop path (ETH pairs): `encodePacked(['address','uint24','address'], [tokenIn, fee, tokenOut])`
- Multi-hop path (UP/USDC):
  - UP → USDC: `encodePacked([address,uint24,address,uint24,address], [UP,3000,WETH,500,USDC])`
  - USDC → UP: `encodePacked([address,uint24,address,uint24,address], [USDC,500,WETH,3000,UP])`
- The resulting `path` bytes are passed directly to `V3_SWAP_EXACT_IN`.

```typescript
import { encodeAbiParameters, parseAbiParameters } from 'viem';

/**
 * Command byte constants from the Universal Router's Commands.sol.
 * Verified against: https://github.com/Uniswap/universal-router/blob/main/contracts/libraries/Commands.sol
 */
const COMMAND = {
  V3_SWAP_EXACT_IN: 0x00,
  SWEEP: 0x04,
  PAY_PORTION: 0x06,
  WRAP_ETH: 0x0b,
  UNWRAP_WETH: 0x0c,
} as const;

/** Special Universal Router recipient addresses */
const ROUTER_AS_RECIPIENT = '0x0000000000000000000000000000000000000002' as `0x${string}`;
const MSG_SENDER = '0x0000000000000000000000000000000000000001' as `0x${string}`;

/** Native ETH sentinel used by SWEEP after UNWRAP_WETH */
const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`;

export function encodeSwapWithFeeManual(config: {
  tokenOut: `0x${string}`;      // final output token (used by PAY_PORTION/SWEEP)
  path: `0x${string}`;          // single-hop or multi-hop encoded path
  amountIn: bigint;
  amountOutMin: bigint;
  recipient: `0x${string}`;
  feeRecipient: `0x${string}`;
  feeBips: number;
  isNativeEthIn: boolean;
  isNativeEthOut: boolean;
  deadline: number;
}): { calldata: `0x${string}`; value: bigint } {
  const commands: number[] = [];
  const inputs: `0x${string}`[] = [];

  // Calculate the minimum the user should receive after fees (for SWEEP defense-in-depth)
  const sweepAmountMin = config.amountOutMin - (config.amountOutMin * BigInt(config.feeBips) / 10_000n);

  // --- Step 1: If paying with native ETH, wrap it first ---
  if (config.isNativeEthIn) {
    commands.push(COMMAND.WRAP_ETH);
    inputs.push(encodeAbiParameters(
      parseAbiParameters('address recipient, uint256 amountMin'),
      [ROUTER_AS_RECIPIENT, config.amountIn]
    ) as `0x${string}`);
  }

  // --- Step 2: V3_SWAP_EXACT_IN — output goes to Router (held temporarily) ---
  commands.push(COMMAND.V3_SWAP_EXACT_IN);
  inputs.push(encodeAbiParameters(
    parseAbiParameters('address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, bool payerIsUser'),
    [ROUTER_AS_RECIPIENT, config.amountIn, config.amountOutMin, config.path, !config.isNativeEthIn]
  ) as `0x${string}`);

  // --- Step 3: PAY_PORTION — send fee% of output token to fee wallet ---
  // Note: When isNativeEthOut, fee is paid in WETH (fee wallet receives WETH, not ETH).
  // This is simpler and avoids extra unwrap complexity. Document this for the treasury.
  commands.push(COMMAND.PAY_PORTION);
  inputs.push(encodeAbiParameters(
    parseAbiParameters('address token, address recipient, uint256 bips'),
    [config.tokenOut, config.feeRecipient, BigInt(config.feeBips)]
  ) as `0x${string}`);

  // --- Step 4: Handle output delivery ---
  if (config.isNativeEthOut) {
    // Sell direction (Token → ETH): unwrap WETH to native ETH, then sweep ETH to user
    // UNWRAP_WETH converts Router's remaining WETH balance to native ETH
    commands.push(COMMAND.UNWRAP_WETH);
    inputs.push(encodeAbiParameters(
      parseAbiParameters('address recipient, uint256 amountMin'),
      [ROUTER_AS_RECIPIENT, sweepAmountMin]
    ) as `0x${string}`);

    // SWEEP native ETH (address(0)) to the user
    commands.push(COMMAND.SWEEP);
    inputs.push(encodeAbiParameters(
      parseAbiParameters('address token, address recipient, uint256 amountMin'),
      [ETH_ADDRESS, config.recipient, sweepAmountMin]
    ) as `0x${string}`);
  } else {
    // ERC20 output path (ETH→Token or Token→Token): sweep output token directly to user
    commands.push(COMMAND.SWEEP);
    inputs.push(encodeAbiParameters(
      parseAbiParameters('address token, address recipient, uint256 amountMin'),
      [config.tokenOut, config.recipient, sweepAmountMin]
    ) as `0x${string}`);
  }

  // --- Encode the execute(bytes,bytes[],uint256) call ---
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

> **Command Sequences by Direction**:
> - **ETH → Token (buy)**: `WRAP_ETH → V3_SWAP_EXACT_IN → PAY_PORTION → SWEEP(token)`
> - **Token → ETH (sell)**: `V3_SWAP_EXACT_IN → PAY_PORTION(WETH) → UNWRAP_WETH → SWEEP(ETH)`
> - **Token → Token (UP ↔ USDC via WETH)**: `V3_SWAP_EXACT_IN(multi-hop path) → PAY_PORTION → SWEEP(tokenOut)`
>
> The fee wallet receives **WETH** on sell swaps (not native ETH). This avoids additional unwrap complexity and is standard practice — the treasury Gnosis Safe can hold or unwrap WETH as needed.

### Step 6: Permit2 Helpers (`lib/uniswap/permit2.ts`)

```typescript
import type { PublicClient, WalletClient } from 'viem';
import { PERMIT2_ABI } from './abi/permit2';
import { ERC20_ABI } from '@/lib/blockchain/shared/abi-definitions';

// ERC20.approve uses uint256 — standard max approval for the ERC20→Permit2 step.
// Permit2.approve uses uint160 for the allowance amount and uint48 for expiration.
// These are different approval layers: MAX_UINT256 for the ERC20 token contract,
// MAX_UINT160/MAX_UINT48 for Permit2's internal AllowanceTransfer accounting.
const MAX_UINT256 = (1n << 256n) - 1n;
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
 * Approve Permit2 to spend user's tokens (one-time per token).
 * Uses MAX_UINT256 (standard ERC20 max approval), not MAX_UINT160.
 * MAX_UINT160 is for Permit2's internal allowance accounting (different layer).
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
    args: [permit2Address, MAX_UINT256],
    chain: walletClient.chain,
    account: walletClient.account!,
  });
}

/**
 * Grant Permit2 allowance for the Universal Router to pull tokens.
 * Uses MAX_UINT160 amount and MAX_UINT48 expiration so this is a one-time
 * approval — subsequent swaps of any size will not require re-approval.
 */
export async function approveUniversalRouterViaPermit2(
  walletClient: WalletClient,
  permit2Address: `0x${string}`,
  tokenAddress: `0x${string}`,
  routerAddress: `0x${string}`,
): Promise<`0x${string}`> {
  return walletClient.writeContract({
    address: permit2Address,
    abi: PERMIT2_ABI,
    functionName: 'approve',
    args: [tokenAddress, routerAddress, MAX_UINT160, Number(MAX_UINT48)],
    chain: walletClient.chain,
    account: walletClient.account!,
  });
}
```

### Step 7: Main React Hook (`hooks/vendor/useUniswapSwap.ts`)

```typescript
import { useState, useCallback } from 'react';
import { base } from 'viem/chains';
import { createWalletClient, custom, encodePacked, formatEther, formatUnits } from 'viem';
import { usePrivyWriteWallet } from '@/hooks/unlock/usePrivyWriteWallet';
import { ensureWalletOnChainId } from '@/lib/blockchain/shared/ensure-wallet-network';
import { createPublicClientForChain } from '@/lib/blockchain/config';
import type { DeploymentStep } from '@/lib/transaction-stepper/types';
import {
  UNISWAP_ADDRESSES, FEE_CONFIG, DEFAULT_SLIPPAGE_BPS, DEFAULT_DEADLINE_SECONDS,
  resolvePoolTokens, validateFeeConfig,
} from '@/lib/uniswap/constants';
import { fetchPoolState } from '@/lib/uniswap/pool';
import { getQuoteExactInput, getQuoteExactInputSingle, type QuoteResult } from '@/lib/uniswap/quote';
import { encodeSwapWithFeeManual } from '@/lib/uniswap/encode-swap';
import {
  checkErc20ApprovalForPermit2,
  checkPermit2Allowance,
  approveTokenForPermit2,
  approveUniversalRouterViaPermit2,
} from '@/lib/uniswap/permit2';
import { ERC20_ABI } from '@/lib/blockchain/shared/abi-definitions';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('hooks:vendor:uniswap-swap');

export type SwapPair = 'ETH_UP' | 'ETH_USDC' | 'UP_USDC';
export type SwapDirection = 'A_TO_B' | 'B_TO_A'; // pair-relative direction

interface SwapQuote {
  amountOut: bigint;
  feeAmount: bigint;     // portion going to fee wallet
  userReceives: bigint;   // amountOut - feeAmount
  priceImpact: number;    // percentage (0-100)
  gasEstimate: bigint;
}

interface SwapState {
  quote: SwapQuote | null;
  isQuoting: boolean;
  error: string | null;
  balance: bigint | null; // user's balance of the input token/ETH
  // Note: isApproving/isSwapping/txHash are now tracked by useTransactionStepper
  // (step phases: awaiting_wallet → submitted → confirming → success/error)
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
   * Balance for the input side of the selected pair/direction.
   */
  const fetchBalance = useCallback(async (
    pair: SwapPair,
    direction: SwapDirection,
  ): Promise<bigint | null> => {
    if (!wallet?.address) return null;

    try {
      const publicClient = createPublicClientForChain(base);
      const userAddress = wallet.address as `0x${string}`;

      const isEthPair = pair === 'ETH_UP' || pair === 'ETH_USDC';
      const isBuySide = direction === 'A_TO_B'; // A=ETH for ETH pairs

      if (isEthPair && isBuySide) {
        // Buying with ETH — check native ETH balance
        const balance = await publicClient.getBalance({ address: userAddress });
        setState(prev => ({ ...prev, balance }));
        return balance;
      } else {
        // ERC20 input on sell side or token-token route
        let tokenIn: `0x${string}`;
        if (pair === 'UP_USDC') {
          tokenIn = direction === 'A_TO_B' ? addresses.up : addresses.usdc;
        } else {
          const poolAddress = addresses.pools[pair];
          const poolState = await fetchPoolState(publicClient, poolAddress);
          const { otherToken } = resolvePoolTokens(poolState.token0, poolState.token1);
          tokenIn = otherToken; // ETH pairs only reach this branch on token-input side
        }

        const balance = await publicClient.readContract({
          address: tokenIn as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [userAddress],
        }) as bigint;

        setState(prev => ({ ...prev, balance }));
        return balance;
      }
    } catch (err) {
      log.error('Balance fetch failed', { err });
      return null;
    }
  }, [wallet?.address, addresses]);

  /**
   * Fetch a quote for the given swap.
   * Does NOT require a connected wallet — uses public client only.
   */
  const getQuote = useCallback(async (
    pair: SwapPair,
    direction: SwapDirection,
    amountIn: bigint,
  ): Promise<SwapQuote | null> => {
    setState(prev => ({ ...prev, isQuoting: true, error: null }));

    try {
      // Validate fee config early — BigInt(feeBips) would throw for non-integer values
      validateFeeConfig();

      const publicClient = createPublicClientForChain(base);
      let quoteResult: QuoteResult;
      let poolState: PoolState | null = null;

      if (pair === 'UP_USDC') {
        const path =
          direction === 'A_TO_B'
            ? encodePacked(
                ['address', 'uint24', 'address', 'uint24', 'address'],
                [addresses.up, 3000, addresses.weth, 500, addresses.usdc],
              )
            : encodePacked(
                ['address', 'uint24', 'address', 'uint24', 'address'],
                [addresses.usdc, 500, addresses.weth, 3000, addresses.up],
              );
        quoteResult = await getQuoteExactInput(publicClient, addresses.quoterV2, { path, amountIn });
      } else {
        const poolAddress = addresses.pools[pair];
        poolState = await fetchPoolState(publicClient, poolAddress);
        const { wethToken, otherToken } = resolvePoolTokens(poolState.token0, poolState.token1);
        const tokenIn = direction === 'A_TO_B' ? wethToken : otherToken; // A=ETH, B=token
        const tokenOut = direction === 'A_TO_B' ? otherToken : wethToken;
        quoteResult = await getQuoteExactInputSingle(
          publicClient,
          addresses.quoterV2,
          { tokenIn, tokenOut, fee: poolState.fee, amountIn },
        );
      }

      const feeAmount = (quoteResult.amountOut * BigInt(FEE_CONFIG.feeBips)) / 10_000n;
      const userReceives = quoteResult.amountOut - feeAmount;

      // Price impact from sqrtPriceX96 shift, using bigint fixed-point to avoid
      // Number() precision loss (squared sqrtPriceX96 values exceed 2^53).
      // price = (sqrtPriceX96)^2.  We compute ratio = priceAfter / priceBefore
      // scaled by 10^18, then deviation from 1e18 = impact %.
      //
      // Single-hop: poolState.sqrtPriceX96 gives the exact pre-swap price.
      // Multi-hop: no single pool state available — impact is computed from
      //   amountOut vs a 1-wei spot quote in a future iteration; for now we
      //   only warn (never block) on multi-hop swaps.
      let priceImpact = 0;
      if (pair !== 'UP_USDC') {
        // Single-hop — exact impact from pool pre/post sqrtPriceX96
        const priceBefore = poolState!.sqrtPriceX96 * poolState!.sqrtPriceX96;
        const priceAfter = quoteResult.sqrtPriceX96After > 0n
          ? quoteResult.sqrtPriceX96After * quoteResult.sqrtPriceX96After
          : priceBefore; // no shift ⇒ 0% impact
        if (priceBefore > 0n) {
          const PRECISION = 10n ** 18n;
          const ratio = (priceAfter * PRECISION) / priceBefore;
          priceImpact = Math.abs(Number(ratio - PRECISION)) / Number(PRECISION) * 100;
        }
      }
      // Multi-hop (UP_USDC): priceImpact stays 0 — warn-only, never block.
      // A future enhancement can quote a 1-wei path to derive spot rate.

      const quote: SwapQuote = {
        amountOut: quoteResult.amountOut,
        feeAmount,
        userReceives,
        priceImpact,
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
  }, [addresses]);

  /**
   * Build DeploymentStep[] for the swap, to be consumed by useTransactionStepper.
   *
   * Returns an array of steps that the stepper runs sequentially on a single "Swap" click.
   * Steps are conditional — approval steps are only included when the on-chain check
   * shows they're needed (first time per token). The final step is always the swap itself.
   *
   * The UI calls buildSwapSteps() once when the user clicks "Swap", feeds the result
   * into useTransactionStepper, then calls stepper.start(). The TransactionStepperModal
   * shows real-time progress (awaiting_wallet → submitted → confirming → success) for
   * each step. The user signs each wallet prompt as it appears — single click, no re-clicks.
   *
   * Uses existing: useTransactionStepper (hooks/useTransactionStepper.ts)
   *                TransactionStepperModal (components/admin/TransactionStepperModal.tsx)
   *                DeploymentStep type (lib/transaction-stepper/types.ts)
   *
   * IMPORTANT: We do NOT use createViemFromPrivyWallet here because it switches
   * the wallet to the app's configured chain (Base Sepolia in dev), not Base Mainnet.
   * Instead, we use ensureWalletOnChainId(provider, { chainId: 8453 }) to explicitly
   * switch the wallet to Base Mainnet, then create a walletClient targeting `base`.
   *
   * @param amountOutMin — the **pre-fee** minimum swap output (i.e. raw quote * (1 - slippage)).
   *   The encoder derives the post-fee SWEEP minimum internally. Do NOT pass post-fee values here.
   */
  const buildSwapSteps = useCallback(async (
    pair: SwapPair,
    direction: SwapDirection,
    amountIn: bigint,
    amountOutMin: bigint,
  ): Promise<DeploymentStep[]> => {
    if (!wallet) throw new Error('Wallet not connected');
    validateFeeConfig();

    {
      // Explicitly switch wallet to Base Mainnet (chain 8453).
      // Do NOT use createViemFromPrivyWallet — it targets the app's default chain
      // (Base Sepolia in dev), not Base Mainnet where Uniswap pools exist.
      const provider = await wallet.getEthereumProvider();
      await ensureWalletOnChainId(provider, { chainId: 8453, networkName: 'Base Mainnet' });

      const walletClient = createWalletClient({
        account: wallet.address as `0x${string}`,
        chain: base,
        transport: custom(provider),
      });
      const publicClient = createPublicClientForChain(base);
      const userAddress = wallet.address as `0x${string}`;
      const isEthPair = pair === 'ETH_UP' || pair === 'ETH_USDC';
      const isNativeEthIn = isEthPair && direction === 'A_TO_B';
      const isNativeEthOut = isEthPair && direction === 'B_TO_A';

      let tokenIn: `0x${string}`;
      let tokenOut: `0x${string}`;
      let path: `0x${string}`;

      if (pair === 'UP_USDC') {
        if (direction === 'A_TO_B') {
          tokenIn = addresses.up;
          tokenOut = addresses.usdc;
          path = encodePacked(
            ['address', 'uint24', 'address', 'uint24', 'address'],
            [addresses.up, 3000, addresses.weth, 500, addresses.usdc],
          );
        } else {
          tokenIn = addresses.usdc;
          tokenOut = addresses.up;
          path = encodePacked(
            ['address', 'uint24', 'address', 'uint24', 'address'],
            [addresses.usdc, 500, addresses.weth, 3000, addresses.up],
          );
        }
      } else {
        const poolAddress = addresses.pools[pair];
        const poolState = await fetchPoolState(publicClient, poolAddress);
        const { wethToken, otherToken } = resolvePoolTokens(poolState.token0, poolState.token1);
        tokenIn = direction === 'A_TO_B' ? wethToken : otherToken;
        tokenOut = direction === 'A_TO_B' ? otherToken : wethToken;
        path = encodePacked(['address', 'uint24', 'address'], [tokenIn, poolState.fee, tokenOut]);
      }

      // --- Balance check (prevent wasted gas on guaranteed-to-fail txs) ---
      if (isNativeEthIn) {
        const ethBalance = await publicClient.getBalance({ address: userAddress });
        if (ethBalance < amountIn) throw new Error('Insufficient ETH balance');
      } else {
        const tokenBalance = await publicClient.readContract({
          address: tokenIn,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [userAddress],
        }) as bigint;
        if (tokenBalance < amountIn) throw new Error('Insufficient token balance');
      }

      // --- Build steps array (conditional approvals + swap) ---
      const steps: DeploymentStep[] = [];

      if (!isNativeEthIn) {
        // Step A: ERC20 → Permit2 (one-time per token, MAX_UINT256)
        const erc20Allowance = await checkErc20ApprovalForPermit2(
          publicClient, tokenIn, userAddress, addresses.permit2,
        );
        if (erc20Allowance < amountIn) {
          steps.push({
            id: 'approve-erc20',
            title: 'Approve token for Permit2',
            description: 'One-time ERC20 approval so Permit2 can access your tokens',
            async execute() {
              const hash = await approveTokenForPermit2(walletClient, tokenIn, addresses.permit2);
              return {
                transactionHash: hash,
                async waitForConfirmation() {
                  await publicClient.waitForTransactionReceipt({ hash });
                  return { transactionHash: hash };
                },
              };
            },
          });
        }

        // Step B: Permit2 → Universal Router (one-time, MAX_UINT160 amount with MAX_UINT48 expiry)
        // Check BOTH amount and expiration — an expired allowance with non-zero amount still reverts.
        const permit2Allowance = await checkPermit2Allowance(
          publicClient, addresses.permit2, userAddress, tokenIn, addresses.universalRouter,
        );
        const nowSeconds = Math.floor(Date.now() / 1000);
        const isExpired = permit2Allowance.expiration <= nowSeconds;
        if (permit2Allowance.amount < amountIn || isExpired) {
          steps.push({
            id: 'approve-permit2',
            title: 'Approve Universal Router via Permit2',
            description: 'One-time Permit2 allowance for the Universal Router',
            async execute() {
              const hash = await approveUniversalRouterViaPermit2(
                walletClient, addresses.permit2, tokenIn, addresses.universalRouter,
              );
              return {
                transactionHash: hash,
                async waitForConfirmation() {
                  await publicClient.waitForTransactionReceipt({ hash });
                  return { transactionHash: hash };
                },
              };
            },
          });
        }
      }

      // Final step: the swap itself
      const deadline = Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS;
      const { calldata, value } = encodeSwapWithFeeManual({
        tokenOut, path, amountIn, amountOutMin, recipient: userAddress,
        feeRecipient: FEE_CONFIG.feeRecipient, feeBips: FEE_CONFIG.feeBips,
        isNativeEthIn, isNativeEthOut, deadline,
      });

      steps.push({
        id: 'swap',
        title: 'Execute Swap',
        description: 'Send swap transaction to the Universal Router',
        async execute() {
          const hash = await walletClient.sendTransaction({
            to: addresses.universalRouter, data: calldata, value,
            chain: walletClient.chain, account: walletClient.account ?? userAddress,
          });
          log.info('Swap transaction submitted', { txHash: hash });
          return {
            transactionHash: hash,
            async waitForConfirmation() {
              await publicClient.waitForTransactionReceipt({ hash });
              log.info('Swap confirmed', { txHash: hash });
              return { transactionHash: hash };
            },
          };
        },
      });

      return steps;
    }
  }, [wallet, addresses]);

  return {
    ...state,
    getQuote,
    buildSwapSteps,
    fetchBalance,
    isSupported: true,
    feeBips: FEE_CONFIG.feeBips,
  };
}
```

### Step 8: UI Component — Tabbed Integration (`components/vendor/UniswapSwapTab.tsx`)

The Uniswap swap will be a **tab within the existing VendorSwap card**, not a separate component. This keeps the UI clean and familiar.

#### Tab Structure in `VendorSwap.tsx`

> **Access gating**: The Uniswap tab inherits VendorSwap's existing GoodDollar verification and membership gates. This is intentional — both tabs require the same access level for consistency.

The existing `VendorSwap.tsx` will be modified to add tab navigation at the top:

```tsx
// In VendorSwap.tsx — add tab state and navigation
const [activeTab, setActiveTab] = useState<'vendor' | 'uniswap'>('vendor');

return (
  <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-slate-900/90 to-slate-900/60 p-6 shadow-2xl shadow-black/40">
    {/* Tab Navigation */}
    <div className="flex gap-1 p-1 mb-4 rounded-lg bg-white/5">
      <button
        onClick={() => setActiveTab('vendor')}
        className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
          activeTab === 'vendor'
            ? 'bg-white/10 text-white shadow-sm'
            : 'text-white/50 hover:text-white/80'
        }`}
      >
        DG Market
      </button>
      <button
        onClick={() => setActiveTab('uniswap')}
        className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
          activeTab === 'uniswap'
            ? 'bg-white/10 text-white shadow-sm'
            : 'text-white/50 hover:text-white/80'
        }`}
      >
        Uniswap
      </button>
    </div>

    {/* Tab Content */}
    {activeTab === 'vendor' ? (
      <VendorSwapContent />  {/* existing swap form, extracted into sub-component */}
    ) : (
      <UniswapSwapTab />     {/* new Uniswap swap form */}
    )}
  </div>
);
```

#### `UniswapSwapTab.tsx` Design

```tsx
// components/vendor/UniswapSwapTab.tsx
//
// Stepper integration follows the same pattern as admin forms (BootcampForm, CohortForm, etc.)
// adapted for swap context:
//
// What we reuse from the admin pattern:
//   - stepperWaitForSteps(count, afterVersion) before stepperStart() — setSwapSteps is
//     async state and the stepper's useEffect hasn't flushed until the next render cycle.
//     The afterVersion parameter (from stepsVersion.current, snapshotted before setting
//     new steps) ensures the stepper has installed the new steps, not just any steps of
//     the same count.  Without this, consecutive same-count runs (e.g. repeated 1-step
//     ETH buys) would resolve immediately and start() would execute stale closures.
//   - await stepperStart() as a direct call inside the async handler
//   - stepperDecisionResolverRef for retry/cancel — without this, a rejected wallet prompt
//     leaves the modal stuck in error state with no recovery path
//   - useMemo on steps for reference stability (triggers stepper useEffect reset)
//
// What we DON'T need from the admin pattern:
//   - canSkipOnError / skip logic — no swap step is skippable (approvals are required,
//     swap can't proceed without them)
//   - Shared context / getResult() — admin steps chain data (step 1 writes lockAddress
//     for step 2). Swap steps are independent on-chain txs.
//   - DeploymentFlowConfig wrapper — just a type passthrough for admin entity types
//   - Dynamic stepperTitle state — static title is fine

import { useState, useCallback, useMemo, useRef } from 'react';
import { useUniswapSwap } from '@/hooks/vendor/useUniswapSwap';
import { useTransactionStepper } from '@/hooks/useTransactionStepper';
import { TransactionStepperModal } from '@/components/admin/TransactionStepperModal';
import type { DeploymentStep } from '@/lib/transaction-stepper/types';
import toast from 'react-hot-toast';

export default function UniswapSwapTab() {
  // ... pair, direction, amount state + useUniswapSwap() hook (omitted for brevity) ...
  const { buildSwapSteps, getQuote, /* ... */ } = useUniswapSwap();

  // --- Stepper state ---
  const [swapSteps, setSwapSteps] = useState<DeploymentStep[]>([]);
  const [isStepperOpen, setIsStepperOpen] = useState(false);

  // useMemo ensures a new array reference when swapSteps changes,
  // which triggers the stepper's useEffect to reset runtime state.
  const stepsForStepper = useMemo(() => swapSteps, [swapSteps]);

  const {
    state: stepperState,
    start: stepperStart,
    retryStep: stepperRetry,
    waitForSteps: stepperWaitForSteps,
    cancel: stepperCancel,
    stepsVersion: stepperVersion,
  } = useTransactionStepper(stepsForStepper);

  // --- Decision ref: bridges async handleSwap ↔ modal button clicks ---
  // When a step fails, handleSwap suspends on a Promise. The modal's Retry/Cancel
  // buttons resolve that Promise, allowing handleSwap to continue.
  const decisionResolverRef = useRef<
    ((decision: 'retry' | 'cancel') => void) | null
  >(null);

  const handleStepperRetry = useCallback(() => {
    if (decisionResolverRef.current) {
      decisionResolverRef.current('retry');
      decisionResolverRef.current = null;
    }
  }, []);

  const handleStepperCancel = useCallback(() => {
    if (decisionResolverRef.current) {
      decisionResolverRef.current('cancel');
      decisionResolverRef.current = null;
      return;
    }
    stepperCancel();
    setIsStepperOpen(false);
  }, [stepperCancel]);

  const handleStepperClose = useCallback(() => {
    if (!stepperState.canClose) return;
    if (decisionResolverRef.current) {
      decisionResolverRef.current('cancel');
      decisionResolverRef.current = null;
      return;
    }
    setIsStepperOpen(false);
  }, [stepperState.canClose]);

  // --- Main swap handler (single click) ---
  const handleSwap = async () => {
    try {
      // 1. Build steps (checks balances, allowances, fee config — throws on failure)
      const steps = await buildSwapSteps(pair, direction, parsedAmount, amountOutMin);

      // 2. Snapshot stepper version before setting new steps, then wait for it to advance.
      const versionBefore = stepperVersion.current;
      setSwapSteps(steps);
      setIsStepperOpen(true);

      // 3. Wait for stepper to install these exact steps (count + version > snapshot).
      //    Without the version check, same-count runs (e.g. repeated 1-step ETH buys)
      //    would resolve immediately and start() would execute stale closures.
      await stepperWaitForSteps(steps.length, versionBefore);

      // 4. Run all steps sequentially
      try {
        await stepperStart();
      } catch (err: any) {
        // A step failed (wallet rejected, tx reverted, etc.)
        // Suspend here until user clicks Retry or Cancel in the modal.
        // No skip option — swap steps are not skippable.
        while (true) {
          const decision = await new Promise<'retry' | 'cancel'>((resolve) => {
            decisionResolverRef.current = resolve;
          });
          decisionResolverRef.current = null;

          if (decision === 'cancel') {
            stepperCancel();
            setIsStepperOpen(false);
            return; // exit cleanly, no toast — user chose to cancel
          }

          // decision === 'retry'
          try {
            await stepperRetry();
            break; // retry succeeded, fall through to success
          } catch (retryErr) {
            err = retryErr;
            continue; // retry also failed, loop back to await decision
          }
        }
      }

      // 5. All steps succeeded — close modal + success toast
      setIsStepperOpen(false);
      toast.success('Swap complete!');

    } catch (err) {
      // Pre-modal errors (balance, config, chain switch) surface as toast
      toast.error(err instanceof Error ? err.message : 'Swap failed');
    }
  };

  // --- UI Sections (abbreviated) ---
  //    a. Pair selector pills: "ETH/UP" | "ETH/USDC" | "UP/USDC"
  //    b. Direction toggle (pair-aware labels)
  //    c. Amount input with balance display
  //    d. Quote display: "You will receive" → userReceives (post-fee, no fee line shown)
  //    e. Single "Swap" button → calls handleSwap()
  //
  // NOTE: The hook's SwapQuote exposes `feeAmount` and `amountOut` (pre-fee)
  // for internal calculations, but the UI should ONLY display `userReceives`.

  return (
    <div className="space-y-4">
      {/* ... pair selector, direction toggle, amount input, quote display, swap button ... */}

      <TransactionStepperModal
        open={isStepperOpen}
        title="Swap in Progress"
        description="Sign each transaction as prompted by your wallet"
        steps={stepperState.steps}
        activeStepIndex={stepperState.activeStepIndex}
        canClose={stepperState.canClose}
        onRetry={handleStepperRetry}
        onSkip={() => {}} // no-op: swap steps are not skippable
        onCancel={handleStepperCancel}
        onClose={handleStepperClose}
      />
    </div>
  );
}
```

### Step 9: Vendor Page Integration (`pages/lobby/vendor.tsx`)

**No changes needed** to the vendor page itself. The `VendorSwap` component already renders in the page, and the tab navigation will be added inside `VendorSwap.tsx`.

The existing page structure remains:
```tsx
<section className="...">
  <div className="w-full lg:max-w-md">
    <VendorSwap />  {/* Now contains both tabs internally */}
  </div>
  <div className="w-full lg:max-w-sm space-y-6">
    <LightUpButton />
    <LevelUpCard />
  </div>
</section>
```

---

## 7. User Flows

### Flow 1: ETH → UP (Buy UP with ETH) — Happiest Path
```
User lands on Vendor page
  → Selects "ETH/UP" pair, "Buy" direction
  → Enters 0.01 ETH
  → App fetches quote: "You will receive ~1,246.875 UP"
    (internally: amountOut=1250, fee=3.125, userReceives=1246.875 — fee is not shown)
  → User clicks "Swap"
  → Stepper modal opens with 1 step: "Execute Swap"
    (no approvals needed — ETH is sent as msg.value)
  → User signs the transaction in their wallet
  → Modal shows: awaiting_wallet → submitted → confirming → success
  → Universal Router: WRAP_ETH → V3_SWAP → PAY_PORTION → SWEEP
  → User receives ~1,246.875 UP
  → Fee wallet receives ~3.125 UP (silent, not displayed)
  → Toast: "Swap complete! View on BaseScan"
```

### Flow 2: UP → ETH (Sell UP for ETH) — Approval Required
```
User selects "ETH/UP" pair, "Sell" direction
  → Enters 1000 UP
  → App fetches quote: "You will receive ~0.00798 ETH"
    (internally: amountOut=0.008, fee=0.00002 WETH to treasury — fee is not shown)

  First time only:
  → User clicks "Swap" (single click)
  → buildSwapSteps() checks on-chain allowances, returns 3 steps
  → Stepper modal opens showing all steps:
    Step 1: "Approve token for Permit2" — user signs in wallet
    Step 2: "Approve Universal Router via Permit2" — user signs in wallet
    Step 3: "Execute Swap" — user signs in wallet
  → Each step auto-advances after confirmation (no re-clicking the UI)
  → Modal shows per-step progress: awaiting_wallet → submitted → confirming → success

  Subsequent times:
  → buildSwapSteps() finds allowances sufficient, returns only 1 step
  → Stepper modal opens with just "Execute Swap"
  → Single wallet signature

  Transaction executes atomically:
  → Universal Router: V3_SWAP(UP→WETH) → PAY_PORTION(WETH to fee wallet) → UNWRAP_WETH → SWEEP(ETH to user)
  → User receives native ETH (not WETH)
  → Fee wallet receives WETH
```

### Flow 3: UP → USDC (Multi-hop via WETH)
```
User selects "UP/USDC" pair, "UP→USDC"
  → Enters 1,000 UP
  → App builds path: UP (3000) → WETH (500) → USDC
  → Quoter call uses quoteExactInput(path, amountIn)
  → UI shows post-fee receive amount in USDC

  First time only:
  → UP approval to Permit2 (tx 1)
  → Permit2 allowance to Universal Router (tx 2)

  Swap tx:
  → Universal Router: V3_SWAP_EXACT_IN(multi-hop) → PAY_PORTION(USDC) → SWEEP(USDC)
  → User receives USDC
  → Fee wallet receives USDC
```

### Flow 4: Error — Insufficient Liquidity
```
User enters 100 ETH (large amount)
  → Quote returns very high price impact (> 5%)
  → UI shows: "⚠️ Price impact too high (12.3%). Consider a smaller amount."
  → Swap button disabled
```

### Flow 5: Error — Stale Quote
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

### Swap Button States
The swap button shows pre-swap validation states. Once clicked, the `TransactionStepperModal` takes over progress display:

1. `"Enter amount"` (disabled, no amount)
2. `"Fetching quote..."` (disabled, during quote)
3. `"Insufficient balance"` (disabled, red)
4. `"Price impact too high"` (disabled, warning)
5. `"Swap"` (enabled, ready)

On click → `buildSwapSteps()` runs → stepper modal opens → per-step progress shown in modal.
No separate "Approve" button state needed — approvals are steps within the stepper.

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
| `Unexpected error` (Quoter) | Route illiquid or temporarily unavailable | "Route unavailable right now. Try a smaller amount or different pair." | Retry / fallback |
| User rejected tx | Wallet popup dismissed | "Transaction cancelled." | No action |
| RPC timeout | Network issue | "Network error. Please try again." | Retry |
| Pool not found | Invalid pool address | "This trading pair is not available on this network." | Disable pair |

### Implementation Pattern
Follow the existing `useDGMarket` error handling pattern — return `{ success: boolean, error?: string }` from the hook, and show errors via the existing toast system (`react-hot-toast`).

---

## 11. Test Cases

### Unit Tests

#### `lib/uniswap/constants.test.ts`
| Test | Description |
|---|---|
| `resolvePoolTokens identifies WETH as token0` | When WETH address is token0, `wethToken` matches token0 |
| `resolvePoolTokens identifies WETH as token1` | When WETH address is token1, `wethToken` matches token1 |
| `resolvePoolTokens is case-insensitive` | Handles mixed-case addresses correctly |
| `validateFeeConfig throws when fee wallet not set` | Error when `NEXT_PUBLIC_UNISWAP_FEE_WALLET` is undefined |
| `validateFeeConfig passes when fee wallet is set` | No error when env var is a valid address |

#### `lib/uniswap/encode-swap.test.ts`
| Test | Description |
|---|---|
| `buy: encodes WRAP_ETH → V3_SWAP → PAY_PORTION → SWEEP` | Verify 4 commands in order when `isNativeEthIn=true, isNativeEthOut=false` |
| `sell: encodes V3_SWAP → PAY_PORTION → UNWRAP_WETH → SWEEP` | Verify 4 commands in order when `isNativeEthIn=false, isNativeEthOut=true` |
| `token-token: encodes V3_SWAP → PAY_PORTION → SWEEP` | Verify no WRAP/UNWRAP for UP↔USDC |
| `multihop path is passed unchanged` | Verify encoded V3 input uses provided bytes path for UP→WETH→USDC |
| `buy: omits WRAP_ETH for ERC20 input` | Verify no WRAP_ETH when `isNativeEthIn=false` |
| `sell: includes UNWRAP_WETH before SWEEP` | Verify UNWRAP_WETH (0x0c) present for sell direction |
| `sell: SWEEP uses ETH_ADDRESS (address(0))` | Verify SWEEP targets native ETH, not WETH |
| `buy: SWEEP uses output token address` | Verify SWEEP targets ERC20 token for buy direction |
| `includes PAY_PORTION with correct fee bips` | Verify fee recipient and bips are encoded |
| `SWEEP amountMin accounts for fee deduction` | Verify `sweepAmountMin = amountOutMin - (amountOutMin * feeBips / 10000)` |
| `calculates correct value for ETH swaps` | `value` equals `amountIn` for ETH input, `0n` otherwise |
| `generates valid execute selector` | First 4 bytes match `0x3593564c` |

#### `lib/uniswap/permit2.test.ts`
| Test | Description |
|---|---|
| `detects insufficient ERC20 allowance` | Returns false when allowance < amount |
| `detects sufficient Permit2 allowance` | Returns true when amount/expiration are OK |
| `skips approval when allowance sufficient` | No write call made |
| `approveUniversalRouterViaPermit2 uses MAX_UINT160` | Verify one-time approval amount is MAX_UINT160, not per-swap |

#### `lib/uniswap/quote.test.ts`
| Test | Description |
|---|---|
| `returns valid quote for ETH→USDC` | Mock QuoterV2 response, verify parsed output |
| `returns valid quote for UP→USDC via WETH` | Mock `quoteExactInput(path, amountIn)` response, verify parsed output |
| `calculates fee split correctly` | `feeAmount + userReceives == amountOut` |
| `calculates price impact from pool sqrtPriceX96 vs quoter sqrtPriceX96After` | Single-hop: non-zero impact when after differs from pool pre-state; multi-hop: always 0 |
| `handles zero amount gracefully` | Returns 0 without throwing |

#### `hooks/vendor/useUniswapSwap.test.ts`
| Test | Description |
|---|---|
| `always targets Base Mainnet` | Verify public client uses `base` chain regardless of app network |
| `fetches quote and updates state` | Mock pool + quoter, verify state.quote including priceImpact |
| `fetches quote for UP_USDC using quoteExactInput` | Verify multihop path is used and amountOut is parsed |
| `resolves token ordering correctly` | Verify WETH is identified regardless of token0/token1 position |
| `buildSwapSteps includes approval steps for sell` | Verify returned steps array has approve-erc20, approve-permit2, and swap steps when allowances are insufficient |
| `buildSwapSteps skips approvals when allowances sufficient` | Verify returned steps array has only the swap step when allowances are OK |
| `buildSwapSteps includes approval steps for UP_USDC` | Verify tokenIn approval checks for UP and USDC side independently |
| `buildSwapSteps returns only swap step for ETH buy` | No approval steps when buying with ETH (msg.value) |
| `buildSwapSteps checks balance (ETH)` | Verify throws 'Insufficient ETH balance' when getBalance < amountIn |
| `buildSwapSteps checks balance (ERC20)` | Verify throws 'Insufficient token balance' when balanceOf < amountIn |
| `buildSwapSteps validates fee config` | Verify throws when fee wallet is unconfigured or feeBips invalid |
| `swap step encodes isNativeEthOut=true for sell` | Verify UNWRAP_WETH path is triggered in the swap step's calldata |
| `step execute() returns TxResult with waitForConfirmation` | Verify each step's execute returns hash + confirmation awaiter (stepper contract) |
| `getQuote does not depend on wallet` | Verify quote works without connected wallet |

#### `components/vendor/UniswapSwap.test.tsx`
| Test | Description |
|---|---|
| `renders tab navigation` | "DG Market" and "Uniswap" tabs visible |
| `renders pair selector in Uniswap tab` | ETH/UP, ETH/USDC, and UP/USDC options visible |
| `renders pair-aware direction toggle` | Buy/Sell for ETH pairs; UP→USDC/USDC→UP for UP/USDC |
| `disables swap button when no amount` | Button shows "Enter amount" |
| `shows post-fee amount after quote` | "You will receive" displays `userReceives` (no fee line shown) |
| `opens stepper modal on swap click` | Verify TransactionStepperModal opens after buildSwapSteps resolves |
| `stepper modal shows approval + swap steps` | For sell direction with no prior approvals, modal shows 3 steps |
| `stepper modal shows only swap step for ETH buy` | No approval steps shown for ETH→Token |
| `retry works after wallet rejection` | Reject wallet prompt → modal shows error → click Retry → step re-executes |
| `cancel closes modal cleanly` | Click Cancel during error state → modal closes, no dangling state |
| `consecutive same-count swaps use fresh steps` | Run 1-step ETH buy → complete → run another 1-step ETH buy → stepper executes the new step, not stale closure |
| `shows price impact warning` | Warning displayed when priceImpact > 1% |
| `blocks swap when price impact > 5% (single-hop)` | Swap button disabled with warning; multi-hop returns 0 impact (warn-only) |

### Integration Tests (Manual / E2E on Fork)
| Test | Description |
|---|---|
| `ETH → UP swap on mainnet fork` | Full end-to-end with Anvil fork, verify fee wallet balance (UP token) |
| `UP → ETH with approval flow` | Verify Permit2 + Universal Router approval chain, user receives native ETH |
| `UP → ETH: user receives ETH not WETH` | Verify user's ETH balance increased (not WETH balance) |
| `UP → ETH: fee wallet receives WETH` | Verify fee wallet's WETH balance increased |
| `UP → USDC via WETH route` | Verify path routing UP→WETH→USDC and fee wallet receives USDC |
| `USDC → UP via WETH route` | Verify reverse path USDC→WETH→UP and fee wallet receives UP |
| `Fee calculation accuracy` | Verify exact fee amount matches `feeBips / 10000 * amountOut` |
| `Slippage protection` | Manipulate pool price, verify revert on exceeded slippage |
| `Token ordering: ETH/USDC pool` | Verify WETH is correctly identified as token0 (lower address) |
| `Token ordering: ETH/UP pool` | Verify WETH/UP positions match on-chain pool state |

---

## 12. Security Considerations

| Risk | Mitigation |
|---|---|
| Fee wallet compromise | Use a Gnosis Safe multisig. Never use a single EOA. |
| Fee percentage manipulation | `FEE_CONFIG.feeBips` is sourced from env vars and hardcoded in the build. Users can inspect but not modify at runtime. |
| Fee wallet misconfiguration | `validateFeeConfig()` is called before every swap execution. If `NEXT_PUBLIC_UNISWAP_FEE_WALLET` is unset, the swap is blocked with a clear error — no fees sent to address(0). |
| Infinite approval to Permit2 | Standard practice (Uniswap, 1inch all do this). Users can revoke via revoke.cash. MAX_UINT160 Permit2→Router allowance means one-time approval per token. Allowance check verifies **both** amount and expiration — an expired allowance with non-zero amount would otherwise revert at execution time. |
| Stale quotes leading to unfavorable swaps | Enforce amountOutMinimum with user-configured slippage. Auto-refresh quotes every 15s. SWEEP includes defense-in-depth `amountMin` after fee deduction. **Note**: `amountOutMin` passed to `buildSwapSteps` must be the **pre-fee** minimum (i.e. `quote.amountOut * (10000 - slippageBps) / 10000`). The encoder then derives the post-fee SWEEP minimum internally — passing a post-fee value would make the V3_SWAP check too strict and cause unnecessary reverts. |
| MEV / sandwich attacks | Use tight deadlines (5 min). Consider using Flashbots Protect RPC for mainnet. |
| Front-running the fee | Not exploitable — fee is a fixed percentage encoded in the calldata the user signs. |
| Token ordering bugs | `resolvePoolTokens()` compares against known WETH address (mirrors uniswap-buyer logic). Never assumes token0/token1 positional ordering. |
| Sell swaps delivering WETH instead of ETH | `UNWRAP_WETH` command converts Router's WETH to native ETH before SWEEP. Fee wallet receives WETH (documented design choice). |
| Chain mismatch (dev on Sepolia) | `ensureWalletOnChainId(provider, { chainId: 8453 })` explicitly switches the wallet to Base Mainnet before any write operation. We do NOT use `createViemFromPrivyWallet` for swaps because it targets the app's configured chain (Base Sepolia in dev). Public client always targets `base` via `createPublicClientForChain`. |

---

## 13. Resolved Decisions

All architectural decisions have been finalized:

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | **Network** | ✅ **Base Mainnet only** | Pools don't exist on Sepolia. Use `createPublicClientForChain(base)` for a dedicated Base Mainnet provider, just like the address dropdown component — works regardless of `NEXT_PUBLIC_BLOCKCHAIN_NETWORK`. |
| 2 | **Layout** | ✅ **Tabbed interface** | Single card with "DG Market" and "Uniswap" tabs. Cleaner, less clutter, flexible for future additions. |
| 3 | **Supported pairs** | ✅ **Hardcoded 3 pairs** | ETH ↔ UP, ETH ↔ USDC, and UP ↔ USDC (multi-hop via WETH). No config-driven extensibility for MVP. |
| 4 | **Swap directions** | ✅ **Bidirectional** | Both buy (ETH→Token) and sell (Token→ETH). Sell requires Permit2 approval flow. |
| 5 | **Fee percentage** | ✅ **0.25% via env var** | `NEXT_PUBLIC_UNISWAP_FEE_BIPS=25` with fallback to 25. Sufficient for MVP. |
| 6 | **Encoding strategy** | ✅ **Manual Viem encoding** | No `@uniswap/universal-router-sdk` or other Uniswap SDK dependencies. All calldata encoded with Viem's `encodeAbiParameters` / `encodePacked`. Zero dependency risk. |
| 7 | **Fee token** | ✅ **Output token** | `PAY_PORTION` command operates on Router's held balance of the output token. |
| 8 | **Price impact** | ✅ **Warn at 1%, block at 5%** | Protects users from unfavorable swaps. |
| 9 | **Universal Router version** | ✅ **V4 (`0x6ff569...`)** | Base Mainnet deployment ([BaseScan](https://basescan.org/address/0x6ff5693b99212da76ad316178a184ab56d299b43)). Note: `0x66a989...` is the Ethereum Mainnet address — do not use on Base. Command bytes verified against [Commands.sol](https://github.com/Uniswap/universal-router/blob/main/contracts/libraries/Commands.sol). |
| 10 | **Testing strategy** | ✅ **Anvil mainnet fork** | Fork Base Mainnet for integration tests. Real liquidity data, no test pool deployment needed. |
| 11 | **UP/USDC routing** | ✅ **Force multi-hop via WETH (MVP)** | Direct UP/USDC pools can be illiquid; fixed via-WETH path gives stable execution and simpler rollout. |
