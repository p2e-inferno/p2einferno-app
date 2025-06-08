import React from "react";
import { Button } from "../ui/button";
import type { DiscountCodeInputProps } from "./types";

/**
 * DiscountCodeInput Component
 *
 * Provides an input field and apply button for discount codes.
 * Shows loading state when applying codes and handles validation.
 *
 * @param discountCode - Current discount code value
 * @param onDiscountCodeChange - Handler for discount code input changes
 * @param onApplyDiscount - Handler for applying discount codes
 * @param isApplying - Whether discount application is in progress
 */
export const DiscountCodeInput: React.FC<DiscountCodeInputProps> = ({
  discountCode,
  onDiscountCodeChange,
  onApplyDiscount,
  isApplying = false,
}) => {
  return (
    <div>
      <h3 className="text-lg font-bold mb-4">Discount Code</h3>
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Enter discount code"
          value={discountCode}
          onChange={(e) => onDiscountCodeChange(e.target.value)}
          className="flex-1 px-4 py-2 border border-faded-grey/20 rounded-lg focus:ring-2 focus:ring-flame-yellow focus:border-transparent bg-background"
          disabled={isApplying}
        />
        <Button
          variant="outline"
          onClick={onApplyDiscount}
          disabled={!discountCode.trim() || isApplying}
        >
          {isApplying ? "Applying..." : "Apply"}
        </Button>
      </div>
    </div>
  );
};
