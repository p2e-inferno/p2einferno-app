/**
 * Unit tests for lib/uniswap/constants.ts
 */

import {
  resolvePoolTokens,
  validateFeeConfig,
  FEE_CONFIG,
  UNISWAP_ADDRESSES,
} from "@/lib/uniswap/constants";

describe("resolvePoolTokens", () => {
  const weth = UNISWAP_ADDRESSES.weth;

  it("identifies WETH as token0", () => {
    const result = resolvePoolTokens(
      weth,
      "0xaC27fa800955849d6D17cC8952Ba9dD6EAA66187",
    );
    expect(result.wethToken).toBe(weth);
    expect(result.otherToken).toBe(
      "0xaC27fa800955849d6D17cC8952Ba9dD6EAA66187",
    );
  });

  it("identifies WETH as token1", () => {
    const result = resolvePoolTokens(
      "0xaC27fa800955849d6D17cC8952Ba9dD6EAA66187",
      weth,
    );
    expect(result.wethToken).toBe(weth);
    expect(result.otherToken).toBe(
      "0xaC27fa800955849d6D17cC8952Ba9dD6EAA66187",
    );
  });

  it("is case-insensitive", () => {
    const upperWeth = UNISWAP_ADDRESSES.weth
      .toUpperCase()
      .replace("0X", "0x") as `0x${string}`;
    const result = resolvePoolTokens(
      upperWeth,
      "0xaC27fa800955849d6D17cC8952Ba9dD6EAA66187",
    );
    expect(result.wethToken).toBe(upperWeth);
  });

  it("throws when neither token is WETH", () => {
    expect(() =>
      resolvePoolTokens(
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
      ),
    ).toThrow("Neither pool token matches WETH");
  });
});

describe("validateFeeConfig", () => {
  // Tests mutate FEE_CONFIG directly (not process.env) since
  // FEE_CONFIG is evaluated at module load time.

  it("throws when fee wallet is not set", () => {
    // FEE_CONFIG is evaluated at module load, so we test via the validation function
    // by directly checking the current module-level value
    const savedRecipient = FEE_CONFIG.feeRecipient;
    (FEE_CONFIG as any).feeRecipient = undefined;
    expect(() => validateFeeConfig()).toThrow(
      "NEXT_PUBLIC_UNISWAP_FEE_WALLET is not configured",
    );
    (FEE_CONFIG as any).feeRecipient = savedRecipient;
  });

  it("throws when fee wallet is invalid address", () => {
    const savedRecipient = FEE_CONFIG.feeRecipient;
    (FEE_CONFIG as any).feeRecipient = "0xinvalid";
    expect(() => validateFeeConfig()).toThrow("not a valid address");
    (FEE_CONFIG as any).feeRecipient = savedRecipient;
  });

  it("passes when fee wallet is a valid address", () => {
    const savedRecipient = FEE_CONFIG.feeRecipient;
    (FEE_CONFIG as any).feeRecipient =
      "0x1234567890abcdef1234567890abcdef12345678";
    expect(() => validateFeeConfig()).not.toThrow();
    (FEE_CONFIG as any).feeRecipient = savedRecipient;
  });

  it("throws when feeBips is negative", () => {
    const savedRecipient = FEE_CONFIG.feeRecipient;
    const savedBips = FEE_CONFIG.feeBips;
    (FEE_CONFIG as any).feeRecipient =
      "0x1234567890abcdef1234567890abcdef12345678";
    (FEE_CONFIG as any).feeBips = -1;
    expect(() => validateFeeConfig()).toThrow("must be an integer 0-10000");
    (FEE_CONFIG as any).feeBips = savedBips;
    (FEE_CONFIG as any).feeRecipient = savedRecipient;
  });

  it("throws when feeBips exceeds 10000", () => {
    const savedRecipient = FEE_CONFIG.feeRecipient;
    const savedBips = FEE_CONFIG.feeBips;
    (FEE_CONFIG as any).feeRecipient =
      "0x1234567890abcdef1234567890abcdef12345678";
    (FEE_CONFIG as any).feeBips = 10001;
    expect(() => validateFeeConfig()).toThrow("must be an integer 0-10000");
    (FEE_CONFIG as any).feeBips = savedBips;
    (FEE_CONFIG as any).feeRecipient = savedRecipient;
  });
});
