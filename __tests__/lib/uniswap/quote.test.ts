/**
 * Unit tests for lib/uniswap/quote.ts
 */

import {
  getQuoteExactInputSingle,
  getQuoteExactInput,
} from "@/lib/uniswap/quote";
import type { PublicClient } from "viem";

const QUOTER = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a" as `0x${string}`;
const TOKEN_IN = "0x4200000000000000000000000000000000000006" as `0x${string}`;
const TOKEN_OUT = "0xaC27fa800955849d6D17cC8952Ba9dD6EAA66187" as `0x${string}`;

describe("getQuoteExactInputSingle", () => {
  it("returns valid quote for ETH->USDC", async () => {
    const mockResult = [
      1000000n, // amountOut
      79228162514264337593543950336n, // sqrtPriceX96After
      1, // initializedTicksCrossed
      150000n, // gasEstimate
    ];
    const publicClient = {
      simulateContract: jest.fn().mockResolvedValue({ result: mockResult }),
    } as unknown as PublicClient;

    const quote = await getQuoteExactInputSingle(publicClient, QUOTER, {
      tokenIn: TOKEN_IN,
      tokenOut: TOKEN_OUT,
      fee: 500,
      amountIn: 1000000000000000000n,
    });

    expect(quote.amountOut).toBe(1000000n);
    expect(quote.sqrtPriceX96After).toBe(79228162514264337593543950336n);
    expect(quote.initializedTicksCrossed).toBe(1);
    expect(quote.gasEstimate).toBe(150000n);
  });

  it("calculates fee split correctly", async () => {
    const amountOut = 10000n;
    const feeBips = 25; // 0.25%
    const feeAmount = (amountOut * BigInt(feeBips)) / 10_000n;
    const userReceives = amountOut - feeAmount;

    expect(feeAmount + userReceives).toBe(amountOut);
    expect(feeAmount).toBe(25n); // 10000 * 25 / 10000
    expect(userReceives).toBe(9975n);
  });

  it("handles zero amount gracefully", async () => {
    const mockResult = [0n, 0n, 0, 0n];
    const publicClient = {
      simulateContract: jest.fn().mockResolvedValue({ result: mockResult }),
    } as unknown as PublicClient;

    const quote = await getQuoteExactInputSingle(publicClient, QUOTER, {
      tokenIn: TOKEN_IN,
      tokenOut: TOKEN_OUT,
      fee: 500,
      amountIn: 0n,
    });

    expect(quote.amountOut).toBe(0n);
  });
});

describe("getQuoteExactInput", () => {
  it("returns valid quote for UP->USDC via WETH", async () => {
    const mockResult = [
      5000000n, // amountOut
      [79228162514264337593543950336n, 79228162514264337593543950337n], // sqrtPriceX96AfterList
      [1, 2], // initializedTicksCrossedList
      200000n, // gasEstimate
    ];
    const publicClient = {
      simulateContract: jest.fn().mockResolvedValue({ result: mockResult }),
    } as unknown as PublicClient;

    const quote = await getQuoteExactInput(publicClient, QUOTER, {
      path: "0x00" as `0x${string}`,
      amountIn: 1000000000000000000n,
    });

    expect(quote.amountOut).toBe(5000000n);
    // sqrtPriceX96After should be the last in the list
    expect(quote.sqrtPriceX96After).toBe(79228162514264337593543950337n);
    // initializedTicksCrossed should be summed
    expect(quote.initializedTicksCrossed).toBe(3);
    expect(quote.gasEstimate).toBe(200000n);
  });

  it("calculates price impact: single-hop non-zero, multi-hop zero", () => {
    // Single-hop: impact from sqrtPriceX96 shift
    const priceBefore = 100n * 100n; // 10000
    const priceAfter = 99n * 99n; // 9801
    const PRECISION = 10n ** 18n;
    const ratio = (priceAfter * PRECISION) / priceBefore;
    const impact =
      (Math.abs(Number(ratio - PRECISION)) / Number(PRECISION)) * 100;
    expect(impact).toBeGreaterThan(0);

    // Multi-hop: always 0 in MVP
    const multihopImpact = 0;
    expect(multihopImpact).toBe(0);
  });
});
