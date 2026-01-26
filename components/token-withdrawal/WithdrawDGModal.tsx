/**
 * WithdrawDGModal Component
 *
 * Modal dialog for entering withdrawal amount and confirming withdrawal.
 * Handles amount validation, signature creation, and transaction submission.
 */

import React, { useState, Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWithdrawalAccess } from "@/hooks/useWithdrawalAccess";
import { useDGWithdrawal } from "@/hooks/useDGWithdrawal";
import type { WithdrawalLimits } from "@/hooks/useWithdrawalLimits";
import { getBlockExplorerUrl } from "@/lib/blockchain/services/transaction-service";
import { isEASEnabled } from "@/lib/attestation/core/config";

interface WithdrawDGModalProps {
  isOpen: boolean;
  onClose: () => void;
  limits: WithdrawalLimits;
}

export function WithdrawDGModal({
  isOpen,
  onClose,
  limits,
}: WithdrawDGModalProps) {
  const { xpBalance } = useWithdrawalAccess({
    minAmount: limits.minAmount,
    isLoadingLimits: limits.isLoading,
  });
  const {
    initiateWithdrawal,
    isLoading,
    error: withdrawalError,
    txHash,
  } = useDGWithdrawal();

  const { minAmount, maxAmount: maxDailyAmount } = limits;

  const [amount, setAmount] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [attestationScanUrl, setAttestationScanUrl] = useState<string | null>(
    null,
  );
  const [proofCancelled, setProofCancelled] = useState(false);

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
      setAttestationScanUrl(result.attestationScanUrl || null);
      setProofCancelled(Boolean(result.proofCancelled));
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
    setAttestationScanUrl(null);
    setProofCancelled(false);
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
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
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-background border border-purple-500/20 p-6 text-left align-middle shadow-2xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-xl font-bold leading-6 text-white"
                >
                  {isSuccess ? "Pullout Successful!" : "Pullout DG Tokens"}
                </Dialog.Title>

                <div className="mt-4">
                  {isSuccess ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-center">
                        <svg
                          className="h-12 w-12 text-flame-yellow"
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
                      <p className="text-sm text-faded-grey text-center">
                        Your pullout of {amount} DG has been processed
                        successfully.
                      </p>
                      {isEASEnabled() && proofCancelled && (
                        <p className="text-xs text-faded-grey text-center">
                          Withdrawal proof cancelled — withdrawal completed.
                        </p>
                      )}
                      {txHash && (
                        <a
                          href={getBlockExplorerUrl(txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-center text-sm text-flame-yellow hover:text-flame-orange"
                        >
                          View on Explorer →
                        </a>
                      )}
                      {attestationScanUrl && (
                        <a
                          href={attestationScanUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-center text-sm text-flame-yellow hover:text-flame-orange"
                        >
                          View attestation on EAS Scan →
                        </a>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit}>
                      <div className="mb-4">
                        <label
                          htmlFor="amount"
                          className="block text-sm font-medium text-white mb-2"
                        >
                          Amount (DG)
                        </label>
                        <div className="flex items-center space-x-2">
                          <Input
                            type="text"
                            id="amount"
                            value={amount}
                            onChange={handleAmountChange}
                            placeholder={`Min: ${minAmount} DG`}
                            className="flex-1 bg-background/50 border-purple-500/30 placeholder-faded-grey focus:ring-flame-yellow focus:ring-offset-0 focus:border-transparent"
                            disabled={isLoading}
                          />
                          <Button
                            type="button"
                            onClick={handleMaxClick}
                            variant="ghost"
                            className="px-3 py-2 text-sm font-medium text-flame-yellow hover:text-flame-orange"
                            disabled={isLoading}
                          >
                            MAX
                          </Button>
                        </div>
                        <p className="mt-1 text-xs text-faded-grey">
                          Available: {xpBalance.toLocaleString()} DG
                        </p>
                      </div>

                      {displayError && (
                        <div className="mb-4 p-3 bg-red-900/20 border border-red-500/20 rounded-md">
                          <p className="text-sm text-red-300">{displayError}</p>
                        </div>
                      )}

                      <div className="flex justify-end space-x-3">
                        <Button
                          type="button"
                          onClick={handleClose}
                          variant="outline"
                          className="border-purple-500/30 hover:bg-white/10"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          className="px-6 bg-gradient-to-r from-flame-yellow to-flame-orange text-gray-900 font-semibold hover:from-flame-yellow/90 hover:to-flame-orange/90 disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={isLoading || !amount}
                        >
                          {isLoading ? "Processing..." : "Pullout"}
                        </Button>
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
