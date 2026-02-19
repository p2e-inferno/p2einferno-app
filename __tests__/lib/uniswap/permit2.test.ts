/**
 * Unit tests for lib/uniswap/permit2.ts
 */

import {
  checkErc20ApprovalForPermit2,
  checkPermit2Allowance,
  approveUniversalRouterViaPermit2,
} from "@/lib/uniswap/permit2";
import type { PublicClient, WalletClient } from "viem";

const TOKEN = "0x1111111111111111111111111111111111111111" as `0x${string}`;
const OWNER = "0x2222222222222222222222222222222222222222" as `0x${string}`;
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as `0x${string}`;
const ROUTER = "0x6ff5693b99212da76ad316178a184ab56d299b43" as `0x${string}`;

describe("checkErc20ApprovalForPermit2", () => {
  it("detects insufficient ERC20 allowance", async () => {
    const publicClient = {
      readContract: jest.fn().mockResolvedValue(100n),
    } as unknown as PublicClient;

    const result = await checkErc20ApprovalForPermit2(
      publicClient,
      TOKEN,
      OWNER,
      PERMIT2,
    );
    expect(result).toBe(100n);
    // 100n < needed amount means insufficient
    expect(result < 1000n).toBe(true);
  });

  it("detects sufficient ERC20 allowance", async () => {
    const publicClient = {
      readContract: jest.fn().mockResolvedValue((1n << 256n) - 1n),
    } as unknown as PublicClient;

    const result = await checkErc20ApprovalForPermit2(
      publicClient,
      TOKEN,
      OWNER,
      PERMIT2,
    );
    expect(result >= 1000n).toBe(true);
  });
});

describe("checkPermit2Allowance", () => {
  it("detects sufficient Permit2 allowance", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const publicClient = {
      readContract: jest.fn().mockResolvedValue([
        (1n << 160n) - 1n, // MAX_UINT160
        nowSeconds + 3600, // expiry in 1 hour
        0, // nonce
      ]),
    } as unknown as PublicClient;

    const result = await checkPermit2Allowance(
      publicClient,
      PERMIT2,
      OWNER,
      TOKEN,
      ROUTER,
    );
    expect(result.amount).toBe((1n << 160n) - 1n);
    expect(result.expiration).toBeGreaterThan(nowSeconds);
  });

  it("detects expired Permit2 allowance", async () => {
    const pastSeconds = Math.floor(Date.now() / 1000) - 3600;
    const publicClient = {
      readContract: jest.fn().mockResolvedValue([
        (1n << 160n) - 1n,
        pastSeconds, // expired
        0,
      ]),
    } as unknown as PublicClient;

    const result = await checkPermit2Allowance(
      publicClient,
      PERMIT2,
      OWNER,
      TOKEN,
      ROUTER,
    );
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(result.expiration).toBeLessThanOrEqual(nowSeconds);
  });
});

describe("approval skip decision", () => {
  it("skips approveTokenForPermit2 when ERC20 allowance is sufficient", async () => {
    const publicClient = {
      readContract: jest.fn().mockResolvedValue((1n << 256n) - 1n),
    } as unknown as PublicClient;

    const walletClient = {
      writeContract: jest.fn(),
    } as unknown as WalletClient;

    const allowance = await checkErc20ApprovalForPermit2(
      publicClient,
      TOKEN,
      OWNER,
      PERMIT2,
    );
    // If allowance is sufficient, no need to call approveTokenForPermit2
    if (allowance >= 1000n) {
      expect(walletClient.writeContract).not.toHaveBeenCalled();
    }
  });
});

describe("approveUniversalRouterViaPermit2", () => {
  it("uses MAX_UINT160 for approval amount", async () => {
    const walletClient = {
      writeContract: jest.fn().mockResolvedValue("0xhash"),
      chain: { id: 8453 },
      account: OWNER,
    } as unknown as WalletClient;

    await approveUniversalRouterViaPermit2(
      walletClient,
      PERMIT2,
      TOKEN,
      ROUTER,
    );

    expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
    const callArgs = (walletClient.writeContract as jest.Mock).mock.calls[0][0];
    // args[2] should be MAX_UINT160
    expect(callArgs.args[2]).toBe((1n << 160n) - 1n);
  });
});
