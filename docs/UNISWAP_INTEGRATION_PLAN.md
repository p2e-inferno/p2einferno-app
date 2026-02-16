# Uniswap Universal Router Integration Plan

## 1. Overview
This plan outlines the integration of Uniswap V3 swapping capabilities (ETH/UP and ETH/USDC) into the P2E Inferno Vendor interface. The core requirement is to monetize these swaps by implementation of a **Frontend Fee** (Interface Fee) using the Uniswap **Universal Router** without deploying custom smart contracts.

### Key Objectives
- **Frontend Monetization**: Collect a small percentage (e.g., 0.25%) on every swap initiated through the app.
- **KISS Architecture**: Leverage the `UniversalRouter`'s atomic command engine (`PAY_PORTION`).
- **Low Complexity**: Use existing Uniswap SDKs and the app's Wagmi/Viem stack.
- **Zero Contract Deployment**: No new Solidity contracts required.

---

## 2. Technical Stack
- **Router**: Uniswap Universal Router (`0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD` on Base).
- **SDKs**: 
    - `@uniswap/universal-router-sdk` (for command encoding)
    - `@uniswap/v3-sdk` (for pool/route logic)
    - `@uniswap/sdk-core` (for amounts and percentages)
- **Frontend**: Wagmi / Viem / React (Existing).

---

## 3. Architecture & File Structure

### New Files to Create
| File | Purpose |
| :--- | :--- |
| `lib/uniswap/universal-router.ts` | Utilities to encode Universal Router commands and handle `PAY_PORTION`. |
| `hooks/vendor/useUniswapMarket.ts` | React Hook to manage quotes, approvals, and swap execution. |
| `components/vendor/UniswapSwap.tsx` | UI component for ETH/UP and ETH/USDC swaps, designed to match the Vendor aesthetic. |

### Files to Modify
| File | Purpose |
| :--- | :--- |
| `pages/lobby/vendor.tsx` | Integrate the new `UniswapSwap` component into the layout. |
| `package.json` | Add required Uniswap SDK dependencies. |

---

## 4. Implementation Details

### Step 1: Dependencies
Add the following to `package.json`:
```json
{
  "dependencies": {
    "@uniswap/universal-router-sdk": "^2.x.x",
    "@uniswap/v3-sdk": "^3.x.x",
    "@uniswap/sdk-core": "^5.x.x",
    "@uniswap/router-sdk": "^1.x.x"
  }
}
```

### Step 2: The Command Encoder (`lib/uniswap/universal-router.ts`)
This utility will wrap the SDK logic to generate a 3-command batch: `SWAP` -> `PAY_PORTION` -> `SWEEP`.

```typescript
import { RouterPlanner } from '@uniswap/universal-router-sdk';
import { CommandType } from '@uniswap/universal-router-sdk';

export const encodeSwapWithFee = (
  planner: RouterPlanner,
  config: {
    tokenIn: string;
    tokenOut: string;
    amountIn: bigint;
    amountOutMin: bigint;
    path: string;
    feeRecipient: string;
    feeBips: number; // e.g., 25 for 0.25%
    userAddress: string;
  }
) => {
  // 1. Execute the V3 Swap (Output goes to Router)
  planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
    '0x0000000000000000000000000000000000000002', // Special: Send to Router
    config.amountIn,
    config.amountOutMin,
    config.path,
    true, // payerIsUser
  ]);

  // 2. Pay the Frontend Fee from the Router's balance
  planner.addCommand(CommandType.PAY_PORTION, [
    config.tokenOut,
    config.feeRecipient,
    config.feeBips,
  ]);

  // 3. Sweep the remaining tokens to the User
  planner.addCommand(CommandType.SWEEP, [
    config.tokenOut,
    config.userAddress,
    0, // minAmountOut (already handled by swap slippage)
  ]);

  return planner.finalize();
};
```

### Step 3: The UI Component (`components/vendor/UniswapSwap.tsx`)
Create a new card that mimics the `VendorSwap` but targets Uniswap pools.
- **Inputs**: Token Selection (ETH/UP/USDC), Amount.
- **Display**: Calculated Fee (e.g. "0.25% app fee applied"), Min. Received.
- **Action**: Single "Swap" button that handles Permit/Approval + Transaction.

---

## 5. User Flow
1. **Selection**: User chooses to swap ETH for UP on the Vendor page.
2. **Quote**: App fetches a quote from the Uniswap V3 Pool (using the Quoter contract logic from your `uniswap-buyer` code).
3. **Approval**: If swapping an ERC20 (like USDC), the user is prompted to approve the Universal Router.
4. **Execution**:
    - The user clicks "Swap".
    - The app generates the `UniversalRouter` calldata.
    - The user signs a single transaction.
5. **Confirmation**: Total output is split on-chain. The user gets `99.75%` and your treasury gets `0.25%`.

---

## 6. Test Cases

### Unit Tests
- `lib/uniswap/universal-router.test.ts`: Verify that the planner correctly includes all three commands in the encoded calldata.
- `hooks/vendor/useUniswapMarket.test.ts`: Mock the router and verify that `amountOutMin` is correctly calculated based on slippage.

### Integration Tests (Mainnet-Fork or Testnet)
- **Zero-Fee Check**: Verify swap executes correctly with 0% fee.
- **Fee Split**: Use a local fork to check that the `feeRecipient` address received exactly `X%` of the `amountOut`.
- **Slippage Enforcement**: Ensure transaction reverts if the price moves unfavorably beyond the `SLIPPAGE` setting.

---

## 7. Security & Recommendations
- **Fee Recipient**: Hardcode this to a Gnosis Safe multisig or owner address in `.env.local`.
- **Slippage**: Default to 0.5% (consistent with your `uniswap-buyer` settings) but allow power users to adjust.
- **Deadline**: Use a tight deadline (e.g., 5-10 minutes) to prevent late-executed stale trades.
- **Fail-safe**: If the Universal Router call fails, ensure the UI provides a clear error message (liquidity, price impact, or gas).
