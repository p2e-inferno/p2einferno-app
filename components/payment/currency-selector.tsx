import React from "react";
import { formatCurrency } from "../../lib/bootcamp-data";
import type { CurrencySelectorProps } from "./types";

/**
 * CurrencySelector Component
 *
 * Allows users to select between USD and NGN currency options for payment.
 * Displays the equivalent amount in each currency clearly formatted.
 *
 * @param selectedCurrency - Currently selected currency
 * @param onCurrencyChange - Handler for currency selection changes
 * @param usdAmount - Amount in USD
 * @param ngnAmount - Amount in NGN
 */
export const CurrencySelector: React.FC<CurrencySelectorProps> = ({
  selectedCurrency,
  onCurrencyChange,
  usdAmount,
  ngnAmount,
}) => {
  const currencies = [
    { code: "USD" as const, amount: usdAmount },
    { code: "NGN" as const, amount: ngnAmount },
  ];

  return (
    <div>
      <h3 className="text-lg font-bold mb-4">Choose Payment Currency</h3>
      <div className="grid grid-cols-2 gap-4">
        {currencies.map((currency) => (
          <button
            key={currency.code}
            onClick={() => onCurrencyChange(currency.code)}
            className={`p-4 border rounded-lg text-center transition-colors ${
              selectedCurrency === currency.code
                ? "border-flame-yellow bg-flame-yellow/10 text-flame-yellow"
                : "border-faded-grey/20 hover:border-faded-grey/40"
            }`}
          >
            <div className="font-bold">
              {formatCurrency(currency.amount, currency.code)}
            </div>
            <div className="text-sm text-faded-grey">
              Pay in {currency.code}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
