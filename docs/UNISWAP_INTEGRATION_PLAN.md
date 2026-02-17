# Uniswap Frontend Fee Swap Integration — Implementation Plan

> **Status**: Draft v3 — All decisions resolved  
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
- **Base Mainnet only**: Uniswap pools (ETH/UP, ETH/USDC) only exist on Base Mainnet. The integration will use a dedicated Base Mainnet public client regardless of the app's `NEXT_PUBLIC_BLOCKCHAIN_NETWORK` setting.
- **Manual Viem encoding**: No Uniswap SDK dependencies. All Universal Router calldata is encoded manually using Viem's `encodeAbiParameters` / `encodePacked` — this avoids peer dependency conflicts and SDK breaking changes.
- **Tabbed UI**: The Uniswap swap will be integrated as a tab within the existing Vendor card, not as a separate card.
- **Two hardcoded pairs**: ETH ↔ UP and ETH ↔ USDC only. Not extensible for MVP.

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
  },
} as const;

/** Supported swap pairs — hardcoded for MVP */
export type SwapPair = 'ETH_UP' | 'ETH_USDC';

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
  const isToken0Weth = token0.toLowerCase() === UNISWAP_ADDRESSES.weth.toLowerCase();
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
```

### Step 5: Universal Router Command Encoder (`lib/uniswap/encode-swap.ts`)

This is the core of the fee implementation. We use **manual Viem encoding** (no Uniswap SDK dependency) for reliability and zero dependency issues:

```typescript
import { encodePacked, encodeAbiParameters, parseAbiParameters } from 'viem';

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
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  fee: number;
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
  const path = encodePacked(
    ['address', 'uint24', 'address'],
    [config.tokenIn, config.fee, config.tokenOut]
  );
  commands.push(COMMAND.V3_SWAP_EXACT_IN);
  inputs.push(encodeAbiParameters(
    parseAbiParameters('address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, bool payerIsUser'),
    [ROUTER_AS_RECIPIENT, config.amountIn, config.amountOutMin, path, !config.isNativeEthIn]
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
    // Buy direction (ETH → Token): sweep ERC20 output token directly to user
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
>
> The fee wallet receives **WETH** on sell swaps (not native ETH). This avoids additional unwrap complexity and is standard practice — the treasury Gnosis Safe can hold or unwrap WETH as needed.

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
import { useState, useCallback } from 'react';
import { base } from 'viem/chains';
import { formatEther, formatUnits } from 'viem';
import { usePrivyWriteWallet } from '@/hooks/unlock/usePrivyWriteWallet';
import { createViemFromPrivyWallet } from '@/lib/blockchain/providers/privy-viem';
import { createPublicClientForChain } from '@/lib/blockchain/config';
import {
  UNISWAP_ADDRESSES, FEE_CONFIG, DEFAULT_SLIPPAGE_BPS, DEFAULT_DEADLINE_SECONDS,
  resolvePoolTokens, validateFeeConfig,
} from '@/lib/uniswap/constants';
import { fetchPoolState } from '@/lib/uniswap/pool';
import { getQuoteExactInputSingle } from '@/lib/uniswap/quote';
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

export type SwapPair = 'ETH_UP' | 'ETH_USDC';
export type SwapDirection = 'buy' | 'sell'; // buy = ETH→Token, sell = Token→ETH

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
  isApproving: boolean;
  isSwapping: boolean;
  error: string | null;
  txHash: string | null;
  balance: bigint | null; // user's balance of the input token/ETH
}

export function useUniswapSwap() {
  const wallet = usePrivyWriteWallet();
  const addresses = UNISWAP_ADDRESSES;

  const [state, setState] = useState<SwapState>({
    quote: null,
    isQuoting: false,
    isApproving: false,
    isSwapping: false,
    error: null,
    txHash: null,
    balance: null,
  });

  /**
   * Fetch user's balance for the input side of a swap.
   * ETH balance for buy direction, ERC20 balance for sell direction.
   */
  const fetchBalance = useCallback(async (
    pair: SwapPair,
    direction: SwapDirection,
  ): Promise<bigint | null> => {
    if (!wallet?.address) return null;

    try {
      const publicClient = createPublicClientForChain(base);
      const userAddress = wallet.address as `0x${string}`;

      if (direction === 'buy') {
        // Buying with ETH — check native ETH balance
        const balance = await publicClient.getBalance({ address: userAddress });
        setState(prev => ({ ...prev, balance }));
        return balance;
      } else {
        // Selling token — check ERC20 balance
        const poolAddress = addresses.pools[pair];
        const poolState = await fetchPoolState(publicClient, poolAddress);
        const { otherToken } = resolvePoolTokens(poolState.token0, poolState.token1);

        const balance = await publicClient.readContract({
          address: otherToken,
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
      const publicClient = createPublicClientForChain(base);
      const poolAddress = addresses.pools[pair];
      const poolState = await fetchPoolState(publicClient, poolAddress);

      // Resolve token ordering — WETH can be token0 or token1 depending on addresses
      const { wethToken, otherToken } = resolvePoolTokens(poolState.token0, poolState.token1);
      const tokenIn = direction === 'buy' ? wethToken : otherToken;
      const tokenOut = direction === 'buy' ? otherToken : wethToken;

      const quoteResult = await getQuoteExactInputSingle(
        publicClient,
        addresses.quoterV2,
        { tokenIn, tokenOut, fee: poolState.fee, amountIn },
      );

      const feeAmount = (quoteResult.amountOut * BigInt(FEE_CONFIG.feeBips)) / 10_000n;
      const userReceives = quoteResult.amountOut - feeAmount;

      // Calculate price impact from sqrtPriceX96 shift
      // sqrtPriceX96 is sqrt(price) * 2^96, so price = (sqrtPriceX96)^2 / 2^192
      // Price impact = |1 - priceAfter/priceBefore| * 100
      const priceBefore = poolState.sqrtPriceX96 * poolState.sqrtPriceX96;
      const priceAfter = quoteResult.sqrtPriceX96After * quoteResult.sqrtPriceX96After;
      const priceImpact = priceBefore > 0n
        ? Math.abs(1 - Number(priceAfter) / Number(priceBefore)) * 100
        : 0;

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
   * Execute the swap with fee.
   * Handles Permit2 approvals for sell direction, encodes Universal Router commands,
   * and sends the transaction via Privy wallet.
   *
   * Note: createViemFromPrivyWallet handles chain switching automatically.
   * If the user is on Base Sepolia (dev default), they will be prompted to
   * switch to Base Mainnet before the transaction is sent.
   */
  const executeSwap = useCallback(async (
    pair: SwapPair,
    direction: SwapDirection,
    amountIn: bigint,
    amountOutMin: bigint,
  ) => {
    if (!wallet) {
      setState(prev => ({ ...prev, error: 'Wallet not connected' }));
      return;
    }

    // Validate fee config at execution time (fail fast if misconfigured)
    try {
      validateFeeConfig();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Fee config invalid';
      setState(prev => ({ ...prev, error: msg }));
      return;
    }

    setState(prev => ({ ...prev, isSwapping: true, error: null, txHash: null }));

    try {
      const { walletClient } = await createViemFromPrivyWallet(wallet);
      const publicClient = createPublicClientForChain(base);
      const userAddress = wallet.address as `0x${string}`;
      const poolAddress = addresses.pools[pair];
      const poolState = await fetchPoolState(publicClient, poolAddress);

      // Resolve token ordering using WETH address comparison (not positional assumption)
      const { wethToken, otherToken } = resolvePoolTokens(poolState.token0, poolState.token1);
      const isNativeEthIn = direction === 'buy';
      const isNativeEthOut = direction === 'sell';
      const tokenIn = isNativeEthIn ? wethToken : otherToken;
      const tokenOut = isNativeEthIn ? otherToken : wethToken;

      // --- Balance check (prevent wasted gas on guaranteed-to-fail txs) ---
      if (isNativeEthIn) {
        const ethBalance = await publicClient.getBalance({ address: userAddress });
        if (ethBalance < amountIn) {
          setState(prev => ({ ...prev, isSwapping: false, error: 'Insufficient ETH balance' }));
          return;
        }
      } else {
        const tokenBalance = await publicClient.readContract({
          address: tokenIn,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [userAddress],
        }) as bigint;
        if (tokenBalance < amountIn) {
          setState(prev => ({ ...prev, isSwapping: false, error: 'Insufficient token balance' }));
          return;
        }
      }

      // --- Handle Approvals (only for ERC20 → ETH sell direction) ---
      if (!isNativeEthIn) {
        setState(prev => ({ ...prev, isApproving: true }));

        // Step A: ERC20 → Permit2 (one-time per token, MAX_UINT160)
        const erc20Allowance = await checkErc20ApprovalForPermit2(
          publicClient, tokenIn, userAddress, addresses.permit2,
        );
        if (erc20Allowance < amountIn) {
          log.info('Approving token for Permit2');
          const approveTx = await approveTokenForPermit2(walletClient, tokenIn, addresses.permit2);
          await publicClient.waitForTransactionReceipt({ hash: approveTx });
        }

        // Step B: Permit2 → Universal Router (one-time, MAX_UINT160 amount with MAX_UINT48 expiry)
        const permit2Allowance = await checkPermit2Allowance(
          publicClient, addresses.permit2, userAddress, tokenIn, addresses.universalRouter,
        );
        if (permit2Allowance.amount < amountIn) {
          log.info('Approving Universal Router via Permit2');
          const permit2Tx = await approveUniversalRouterViaPermit2(
            walletClient, addresses.permit2, tokenIn, addresses.universalRouter,
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
        isNativeEthOut,
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
    fetchBalance,
    isSupported: true,
    feeBips: FEE_CONFIG.feeBips,
  };
}
```

### Step 8: UI Component — Tabbed Integration (`components/vendor/UniswapSwapTab.tsx`)

The Uniswap swap will be a **tab within the existing VendorSwap card**, not a separate component. This keeps the UI clean and familiar.

#### Tab Structure in `VendorSwap.tsx`

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
export default function UniswapSwapTab() {
  // 1. State: pair (ETH_UP | ETH_USDC), direction (buy | sell), amount
  // 2. Hook: useUniswapSwap()
  // 3. Debounced quote fetching on amount change
  // 4. UI Sections:
  //    a. Pair selector pills: "ETH/UP" | "ETH/USDC"
  //    b. Direction toggle: Buy / Sell
  //    c. Amount input with balance display
  //    d. Quote display card:
  //       - Exchange rate
  //       - App fee (0.25%)
  //       - Min received after fee
  //       - Price impact warning (if > 1%)
  //    e. Action button (Approve → Swap, with loading states)

  return (
    <div className="space-y-4">
      {/* No outer card — inherits from VendorSwap's card container */}
      {/* ... */}
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
  → App fetches quote: "You will receive ~0.008 ETH (fee: 0.00002 ETH in WETH to treasury)"

  First time only:
  → User clicks "Swap"
  → App detects: UP not approved for Permit2
  → Button says "Approve UP" → user signs tx 1
  → App detects: Permit2 not approved for Router
  → Button says "Approve Router" → user signs tx 2
  → Button changes to "Swap" → user signs tx 3

  Subsequent times:
  → User clicks "Swap" → single transaction

  Transaction executes atomically:
  → Universal Router: V3_SWAP(UP→WETH) → PAY_PORTION(WETH to fee wallet) → UNWRAP_WETH → SWEEP(ETH to user)
  → User receives native ETH (not WETH)
  → Fee wallet receives WETH
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
| `always targets Base Mainnet` | Verify public client uses `base` chain regardless of app network |
| `fetches quote and updates state` | Mock pool + quoter, verify state.quote |
| `handles approval flow for sell direction` | Verify 2 approval txs are sent before swap |
| `skips approvals for buy (ETH) direction` | No approval calls when buying with ETH |
| `sets error state on failure` | Verify error message on revert |

#### `components/vendor/UniswapSwap.test.tsx`
| Test | Description |
|---|---|
| `renders tab navigation` | "DG Market" and "Uniswap" tabs visible |
| `renders pair selector in Uniswap tab` | ETH/UP and ETH/USDC options visible |
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

## 13. Resolved Decisions

All architectural decisions have been finalized:

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | **Network** | ✅ **Base Mainnet only** | Pools don't exist on Sepolia. Use `createPublicClientForChain(base)` for a dedicated Base Mainnet provider, just like the address dropdown component — works regardless of `NEXT_PUBLIC_BLOCKCHAIN_NETWORK`. |
| 2 | **Layout** | ✅ **Tabbed interface** | Single card with "DG Market" and "Uniswap" tabs. Cleaner, less clutter, flexible for future additions. |
| 3 | **Supported pairs** | ✅ **Hardcoded 2 pairs** | ETH ↔ UP and ETH ↔ USDC only. No config-driven extensibility for MVP. |
| 4 | **Swap directions** | ✅ **Bidirectional** | Both buy (ETH→Token) and sell (Token→ETH). Sell requires Permit2 approval flow. |
| 5 | **Fee percentage** | ✅ **0.25% via env var** | `NEXT_PUBLIC_UNISWAP_FEE_BIPS=25` with fallback to 25. Sufficient for MVP. |
| 6 | **Encoding strategy** | ✅ **Manual Viem encoding** | No `@uniswap/universal-router-sdk` or other Uniswap SDK dependencies. All calldata encoded with Viem's `encodeAbiParameters` / `encodePacked`. Zero dependency risk. |
| 7 | **Fee token** | ✅ **Output token** | `PAY_PORTION` command operates on Router's held balance of the output token. |
| 8 | **Price impact** | ✅ **Warn at 1%, block at 5%** | Protects users from unfavorable swaps. |
| 9 | **Universal Router version** | ✅ **V4 (`0x6ff569...`)** | Base Mainnet deployment ([BaseScan](https://basescan.org/address/0x6ff5693b99212da76ad316178a184ab56d299b43)). Note: `0x66a989...` is the Ethereum Mainnet address — do not use on Base. Command bytes verified against [Commands.sol](https://github.com/Uniswap/universal-router/blob/main/contracts/libraries/Commands.sol). |
| 10 | **Testing strategy** | ✅ **Anvil mainnet fork** | Fork Base Mainnet for integration tests. Real liquidity data, no test pool deployment needed. |
