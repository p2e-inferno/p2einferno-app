/**
 * WithdrawDGButton Component
 *
 * Trigger button to open the withdrawal modal.
 * Disabled if user doesn't have withdrawal access.
 */

import React, { useState } from "react";
import { useWithdrawalAccess } from "@/hooks/useWithdrawalAccess";
import { WithdrawDGModal } from "./WithdrawDGModal";
import type { WithdrawalLimits } from "@/hooks/useWithdrawalLimits";

interface WithdrawDGButtonProps {
  className?: string;
  variant?: "primary" | "secondary";
  limits: WithdrawalLimits;
}

/**
 * Renders an action button that opens the withdraw modal and displays the user's xDG balance and required minimum.
 *
 * The button is disabled while access is being checked or when withdrawal is not allowed; when disabled it exposes the denial reason as the title. When not loading, the component shows the current `xpBalance` and the `limits.minAmount` with color indicating whether the balance meets the requirement. Opening the button displays the WithdrawDGModal.
 *
 * @param variant - Visual variant of the button; affects styling ("primary" | "secondary").
 * @param limits - Withdrawal limits and loading state used to determine access and to display the required minimum.
 * @param className - Optional additional CSS classes to apply to the button wrapper.
 * @returns A JSX element containing the action button, balance info, and conditionally rendered WithdrawDGModal.
 */
export function WithdrawDGButton({
  className = "",
  variant = "primary",
  limits,
}: WithdrawDGButtonProps) {
  const { canWithdraw, reason, isLoading, xpBalance } = useWithdrawalAccess({
    minAmount: limits.minAmount,
    isLoadingLimits: limits.isLoading,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);

  const baseClasses =
    "relative inline-flex items-center justify-center px-6 py-3 border border-transparent text-sm font-bold rounded-lg focus:outline-none transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden group";

  const variantClasses =
    variant === "primary"
      ? "text-white bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_25px_rgba(79,70,229,0.5)] active:scale-[0.98]"
      : "text-gray-200 bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20";

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <button
        onClick={() => setIsModalOpen(true)}
        disabled={isLoading || !canWithdraw}
        className={`${baseClasses} ${variantClasses}`}
        title={!canWithdraw && reason ? reason : undefined}
      >
        <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
        <div className="relative flex items-center">
          <svg
            className="w-5 h-5 mr-2 group-hover:rotate-12 transition-transform duration-300"
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
          <span className="uppercase tracking-wider">
            {isLoading ? "Checking Access..." : "Pullout DG Tokens"}
          </span>
        </div>
      </button>

      {/* Balance Info - Always visible */}
      {!isLoading && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 px-4 py-3 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Balance</span>
            <span
              className={`text-lg font-bold ${xpBalance >= limits.minAmount
                ? "text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.4)]"
                : "text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]"
                }`}
            >
              {xpBalance.toLocaleString()} <span className="text-xs opacity-70">xDG</span>
            </span>
          </div>

          <div className="hidden sm:block w-px h-8 bg-white/10" />

          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Min Required</span>
            <span className="text-lg font-bold text-gray-200">
              {limits.minAmount.toLocaleString()} <span className="text-xs opacity-70">xDG</span>
            </span>
          </div>

          {xpBalance < limits.minAmount && (
            <div className="sm:ml-auto">
              <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded uppercase font-bold tracking-tighter">
                Insufficient Balance
              </span>
            </div>
          )}
        </div>
      )}

      {isModalOpen && (
        <WithdrawDGModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          limits={limits}
        />
      )}
    </div>
  );
}

