/**
 * WithdrawDGModal Component
 *
 * Modal dialog for entering withdrawal amount and confirming withdrawal.
 * Handles amount validation, signature creation, and transaction submission.
 */

import React, { useState, Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { useWithdrawalAccess } from "@/hooks/useWithdrawalAccess";
import { useDGWithdrawal } from "@/hooks/useDGWithdrawal";
import { useWithdrawalLimits } from "@/hooks/useWithdrawalLimits";

interface WithdrawDGModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WithdrawDGModal({ isOpen, onClose }: WithdrawDGModalProps) {
  const { xpBalance } = useWithdrawalAccess();
  const {
    initiateWithdrawal,
    isLoading,
    error: withdrawalError,
    txHash,
  } = useDGWithdrawal();
  const { minAmount, maxAmount: maxDailyAmount } = useWithdrawalLimits();

  const [amount, setAmount] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow positive integers
    if (value === "" || /^\d+$/.test(value)) {
      setAmount(value);
      setLocalError(null);
    }
  };

  const handleMaxClick = () => {
    setAmount(Math.min(xpBalance, maxDailyAmount).toString());
    setLocalError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const amountNum = parseInt(amount);

    // Validate amount
    if (isNaN(amountNum) || amountNum <= 0) {
      setLocalError("Please enter a valid amount");
      return;
    }

    if (amountNum < minAmount) {
      setLocalError(`Minimum pullout is ${minAmount} DG`);
      return;
    }

    if (amountNum > xpBalance) {
      setLocalError(`Insufficient balance. You have ${xpBalance} DG available`);
      return;
    }

    if (amountNum > maxDailyAmount) {
      setLocalError(`Daily limit is ${maxDailyAmount} DG`);
      return;
    }

    // Initiate withdrawal
    const result = await initiateWithdrawal(amountNum);

    if (result.success) {
      setIsSuccess(true);
      // Close modal after 3 seconds
      setTimeout(() => {
        handleClose();
      }, 3000);
    }
  };

  const handleClose = () => {
    setAmount("");
    setLocalError(null);
    setIsSuccess(false);
    onClose();
  };

  const displayError = localError || withdrawalError;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900"
                >
                  {isSuccess ? "Pullout Successful!" : "Pullout DG Tokens"}
                </Dialog.Title>

                <div className="mt-4">
                  {isSuccess ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-center">
                        <svg
                          className="h-12 w-12 text-green-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-600 text-center">
                        Your pullout of {amount} DG has been processed
                        successfully.
                      </p>
                      {txHash && (
                        <a
                          href={`https://basescan.org/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-center text-sm text-indigo-600 hover:text-indigo-500"
                        >
                          View on BaseScan →
                        </a>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit}>
                      <div className="mb-4">
                        <label
                          htmlFor="amount"
                          className="block text-sm font-medium text-gray-700 mb-2"
                        >
                          Amount (DG)
                        </label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            id="amount"
                            value={amount}
                            onChange={handleAmountChange}
                            placeholder={`Min: ${minAmount} DG`}
                            className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            disabled={isLoading}
                          />
                          <button
                            type="button"
                            onClick={handleMaxClick}
                            className="px-3 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-500"
                            disabled={isLoading}
                          >
                            MAX
                          </button>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          Available: {xpBalance.toLocaleString()} DG
                        </p>
                      </div>

                      {displayError && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                          <p className="text-sm text-red-700">{displayError}</p>
                        </div>
                      )}

                      <div className="flex justify-end space-x-3">
                        <button
                          type="button"
                          onClick={handleClose}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          disabled={isLoading}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={isLoading || !amount}
                        >
                          {isLoading ? "Processing..." : "Pullout"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
