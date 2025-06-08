import React from "react";
import type { PaymentMethodSelectorProps } from "./types";

/**
 * PaymentMethodSelector Component
 *
 * Allows users to select between fiat (card/bank transfer) and crypto payment methods.
 * Clearly displays the options available for each payment type.
 *
 * @param selectedMethod - Currently selected payment method
 * @param onMethodChange - Handler for payment method selection changes
 */
export const PaymentMethodSelector: React.FC<PaymentMethodSelectorProps> = ({
  selectedMethod,
  onMethodChange,
}) => {
  const paymentMethods = [
    {
      id: "fiat" as const,
      name: "Fiat",
      description: "Card/Bank Transfer",
    },
    {
      id: "crypto" as const,
      name: "Crypto",
      description: "USDC/ETH/BTC",
    },
  ];

  return (
    <div>
      <h3 className="text-lg font-bold mb-4">Payment Method</h3>
      <div className="grid grid-cols-2 gap-4">
        {paymentMethods.map((method) => (
          <button
            key={method.id}
            onClick={() => onMethodChange(method.id)}
            className={`p-4 border rounded-lg ${
              selectedMethod === method.id
                ? "border-flame-yellow bg-flame-yellow/10"
                : "border-faded-grey/20"
            }`}
          >
            <div className="text-center">
              <h4 className="font-bold">{method.name}</h4>
              <p className="text-sm text-faded-grey">{method.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
