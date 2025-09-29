import React from "react";
import { formatCurrency } from "@/lib/utils/payment-utils";
import type { OrderSummaryProps } from "./types";

/**
 * OrderSummary Component
 *
 * Displays a detailed breakdown of the order including:
 * - Base bootcamp cost
 * - Applied discounts (if any)
 * - Final total amount
 *
 * @param totalAmount - Total amount to be charged
 * @param currency - Currency for the payment
 * @param discountAmount - Amount of discount applied (optional)
 * @param discountCode - Applied discount code (optional)
 */
export const OrderSummary: React.FC<OrderSummaryProps> = ({
  totalAmount,
  currency,
  discountAmount = 0,
  discountCode,
}) => {
  const baseAmount = totalAmount + discountAmount;

  return (
    <div className="bg-background/50 rounded-lg p-4">
      <h3 className="text-lg font-bold mb-4">Order Summary</h3>
      <div className="space-y-2">
        <div className="flex justify-between">
          <span>Infernal Sparks Bootcamp</span>
          <span>{formatCurrency(baseAmount, currency)}</span>
        </div>

        {discountAmount > 0 && discountCode && (
          <div className="flex justify-between text-green-400">
            <span>Discount ({discountCode})</span>
            <span>-{formatCurrency(discountAmount, currency)}</span>
          </div>
        )}

        <div className="border-t border-faded-grey/20 pt-2">
          <div className="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span className="text-flame-yellow">
              {formatCurrency(totalAmount, currency)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
