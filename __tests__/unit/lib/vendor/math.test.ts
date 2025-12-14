import {
  calculateFee,
  estimateBuy,
  estimateSell,
  formatAmount,
  formatAmountForInput,
  parseAmount,
} from "@/lib/vendor/math";

describe("vendor math", () => {
  describe("parseAmount", () => {
    it("parses decimal strings using token decimals", () => {
      const parsed = parseAmount("1.5", 18);
      expect(parsed).toBe(1500000000000000000n);
    });

    it("returns null for invalid input", () => {
      expect(parseAmount("abc", 18)).toBeNull();
      expect(parseAmount("", 18)).toBeNull();
    });
  });

  describe("formatAmount", () => {
    it("formats with trimmed decimals", () => {
      expect(formatAmount(1500000000000000000n, 18, 4)).toBe("1.5");
    });
  });

  describe("formatAmountForInput", () => {
    it("formats full precision without trailing zeros", () => {
      expect(formatAmountForInput(1000000000000000000n, 18)).toBe("1");
      expect(formatAmountForInput(1500000000000000000n, 18)).toBe("1.5");
    });
  });

  describe("fee + estimates", () => {
    it("calculates fee and net correctly", () => {
      const { fee, net } = calculateFee(10_000n, 100n); // 1%
      expect(fee).toBe(100n);
      expect(net).toBe(9_900n);
    });

    it("estimates buy output as (amount - fee) * rate", () => {
      const { fee, netBase, outSwap } = estimateBuy(10_000n, 100n, 2n);
      expect(fee).toBe(100n);
      expect(netBase).toBe(9_900n);
      expect(outSwap).toBe(19_800n);
    });

    it("estimates sell output as (amount - fee) / rate", () => {
      const { fee, netSwap, outBase } = estimateSell(10_000n, 200n, 2n);
      expect(fee).toBe(200n);
      expect(netSwap).toBe(9_800n);
      expect(outBase).toBe(4_900n);
    });
  });
});

