import { formatUnits, parseUnits } from "viem";

export function parseAmount(input: string, decimals: number): bigint | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return parseUnits(trimmed, decimals);
  } catch {
    return null;
  }
}

export function formatAmount(
  value: bigint,
  decimals: number,
  maxDecimals = 4,
): string {
  const full = formatUnits(value, decimals);
  const [intPart, fracPart] = full.split(".");
  if (!fracPart) return intPart || "0";

  const trimmedFrac = fracPart.slice(0, maxDecimals).replace(/0+$/, "");
  return trimmedFrac ? `${intPart || "0"}.${trimmedFrac}` : (intPart || "0");
}

export function formatAmountForInput(value: bigint, decimals: number): string {
  const full = formatUnits(value, decimals);
  if (!full.includes(".")) return full;
  return full.replace(/\.?0+$/, "");
}

export function calculateFee(amount: bigint, feeBps: bigint): {
  fee: bigint;
  net: bigint;
} {
  const fee = (amount * feeBps) / 10_000n;
  return { fee, net: amount - fee };
}

export function estimateBuy(
  amount: bigint,
  buyFeeBps: bigint,
  exchangeRate: bigint,
): { fee: bigint; netBase: bigint; outSwap: bigint } {
  const { fee, net } = calculateFee(amount, buyFeeBps);
  const outSwap = net * exchangeRate;
  return { fee, netBase: net, outSwap };
}

export function estimateSell(
  amount: bigint,
  sellFeeBps: bigint,
  exchangeRate: bigint,
): { fee: bigint; netSwap: bigint; outBase: bigint } {
  const { fee, net } = calculateFee(amount, sellFeeBps);
  const outBase = exchangeRate > 0n ? net / exchangeRate : 0n;
  return { fee, netSwap: net, outBase };
}
