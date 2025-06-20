import { formatCurrency, type Currency } from "../../lib/payment-utils";
import { AlertCircle, Wallet } from "lucide-react";

interface BlockchainPaymentProps {
  applicationId: string;
  amount: number;
  currency: Currency;
  email: string;
  lockAddress?: string;
  keyManagers?: string[];
  onSuccess?: () => void;
  disabled?: boolean;
}

export function BlockchainPayment({
  amount,
  currency,
  lockAddress,
  keyManagers,
}: BlockchainPaymentProps) {
  return (
    <div className="text-center p-8 bg-blue-50 rounded-lg border border-blue-200">
      <Wallet className="w-16 h-16 text-blue-600 mx-auto mb-4" />
      <h3 className="font-bold text-blue-800 mb-2 text-xl">
        Blockchain Payment Coming Soon
      </h3>
      <p className="text-blue-700 mb-4">
        We're working on integrating USD blockchain payments for {formatCurrency(amount, currency)}.
      </p>
      <div className="bg-blue-100 p-4 rounded-lg">
        <div className="flex items-center justify-center gap-2 text-blue-800">
          <AlertCircle className="w-5 h-5" />
          <span className="font-medium">For now, please use NGN payment with Paystack</span>
        </div>
      </div>
      <div className="mt-4 text-sm text-blue-600">
        <p>Future support for: USDC, ETH, and other cryptocurrencies</p>
      </div>
    </div>
  );
}