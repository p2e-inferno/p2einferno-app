import { CreditCard, Wallet } from "lucide-react";

interface PaymentMethodSelectorProps {
  selectedMethod: "fiat" | "crypto";
  onMethodChange: (method: "fiat" | "crypto") => void;
}

export function PaymentMethodSelector({
  selectedMethod,
  onMethodChange,
}: PaymentMethodSelectorProps) {
  return (
    <div>
      <h3 className="text-lg font-bold mb-4">Payment Method</h3>
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onMethodChange("fiat")}
          className={`p-4 border rounded-lg transition-colors ${
            selectedMethod === "fiat"
              ? "border-flame-yellow bg-flame-yellow/10 ring-2 ring-flame-yellow/20"
              : "border-faded-grey/20 hover:border-faded-grey/40"
          }`}
        >
          <div className="text-center">
            <CreditCard className="w-8 h-8 mx-auto mb-2 text-current" />
            <h4 className="font-bold">Fiat Payment</h4>
            <p className="text-sm text-faded-grey">
              Card, Bank Transfer, USSD
            </p>
            <p className="text-xs text-green-600 mt-1">
              Powered by Paystack
            </p>
          </div>
        </button>

        <button
          onClick={() => onMethodChange("crypto")}
          className={`p-4 border rounded-lg transition-colors ${
            selectedMethod === "crypto"
              ? "border-flame-yellow bg-flame-yellow/10 ring-2 ring-flame-yellow/20"
              : "border-faded-grey/20 hover:border-faded-grey/40"
          }`}
        >
          <div className="text-center">
            <Wallet className="w-8 h-8 mx-auto mb-2 text-current" />
            <h4 className="font-bold">Crypto Payment</h4>
            <p className="text-sm text-faded-grey">
              USDC, ETH, BTC
            </p>
            <p className="text-xs text-orange-600 mt-1">
              Coming Soon
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}