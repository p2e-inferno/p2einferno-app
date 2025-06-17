import { formatCurrency, type Currency } from "../../lib/payment-utils";

interface PaymentSummaryProps {
  amount: number;
  currency: Currency;
  bootcampName: string;
  discountAmount?: number;
}

export function PaymentSummary({
  amount,
  currency,
  bootcampName,
  discountAmount = 0,
}: PaymentSummaryProps) {
  const subtotal = amount + discountAmount;
  const total = amount;

  return (
    <div className="bg-background/50 rounded-lg p-6">
      <h3 className="text-lg font-bold mb-4">Order Summary</h3>
      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="text-faded-grey">{bootcampName}</span>
          <span>{formatCurrency(subtotal, currency)}</span>
        </div>

        {discountAmount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Discount</span>
            <span>-{formatCurrency(discountAmount, currency)}</span>
          </div>
        )}

        <hr className="border-faded-grey/20" />

        <div className="flex justify-between font-bold text-lg">
          <span>Total</span>
          <span className="text-flame-yellow">
            {formatCurrency(total, currency)}
          </span>
        </div>

        <div className="text-xs text-faded-grey mt-4">
          <p>
            {currency === "NGN" 
              ? "Secure payment powered by Paystack. All transactions are encrypted and secure."
              : "Blockchain payment will be processed on-chain with crypto wallets."
            }
          </p>
        </div>
      </div>
    </div>
  );
}
