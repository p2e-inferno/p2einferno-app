/**
 * WithdrawDGButton Component
 *
 * Trigger button to open the withdrawal modal.
 * Disabled if user doesn't have withdrawal access.
 */

import React, { useState } from "react";
import { useWithdrawalAccess } from "@/hooks/useWithdrawalAccess";
import { WithdrawDGModal } from "./WithdrawDGModal";

interface WithdrawDGButtonProps {
  className?: string;
  variant?: "primary" | "secondary";
}

export function WithdrawDGButton({
  className = "",
  variant = "primary",
}: WithdrawDGButtonProps) {
  const { canWithdraw, reason, isLoading } = useWithdrawalAccess();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const baseClasses =
    "inline-flex items-center px-4 py-2 border text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

  const variantClasses =
    variant === "primary"
      ? "border-transparent text-white bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500"
      : "border-gray-300 text-gray-700 bg-white hover:bg-gray-50 focus:ring-indigo-500";

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        disabled={isLoading || !canWithdraw}
        className={`${baseClasses} ${variantClasses} ${className}`}
        title={!canWithdraw && reason ? reason : undefined}
      >
        <svg
          className="w-4 h-4 mr-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        {isLoading ? "Checking Access..." : "Pullout DG"}
      </button>

      <WithdrawDGModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
