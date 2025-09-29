export type Currency = "NGN" | "USD";
export type PaymentMethod = "paystack" | "blockchain";
export type PaymentStatus =
  | "pending"
  | "processing"
  | "success"
  | "failed"
  | "abandoned";

export interface PaymentConfig {
  amount: number;
  currency: Currency;
  email: string;
  reference: string;
  applicationId: string;
  paymentMethod: PaymentMethod;
}

/**
 * Convert amount to smallest currency unit
 * NGN: 1 Naira = 100 kobo
 * USD: 1 Dollar = 100 cents (for blockchain payments)
 */
export function convertToSmallestUnit(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Convert smallest unit back to main currency
 */
export function convertFromSmallestUnit(smallestUnit: number): number {
  return smallestUnit / 100;
}

/**
 * Generate unique payment reference
 */
export function generatePaymentReference(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `p2e_${timestamp}_${random}`;
}

/**
 * Validate currency amount based on minimums and payment method
 */
export function validatePaymentAmount(
  amount: number,
  currency: Currency,
): boolean {
  const minimums = {
    NGN: 10, // 10 Naira minimum for Paystack
    USD: 1, // 1 USD minimum for blockchain
  };

  return amount >= minimums[currency];
}

/**
 * Get payment method based on currency
 */
export function getPaymentMethod(currency: Currency): PaymentMethod {
  return currency === "NGN" ? "paystack" : "blockchain";
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, currency: Currency): string {
  const formatters = {
    NGN: new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
    }),
    USD: new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }),
  };

  return formatters[currency].format(amount);
}
