/**
 * WithdrawDGModal Component
 *
 * Modal dialog for entering withdrawal amount and confirming withdrawal.
 * Handles amount validation, signature creation, and transaction submission.
 */

import React, { useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWithdrawalAccess } from "@/hooks/useWithdrawalAccess";
import { useDGWithdrawal } from "@/hooks/useDGWithdrawal";
import type { WithdrawalLimits } from "@/hooks/useWithdrawalLimits";
import { getBlockExplorerUrl } from "@/lib/blockchain/services/transaction-service";
import { isEASEnabled } from "@/lib/attestation/core/config";
import { TransactionStepperModal } from "@/components/admin/TransactionStepperModal";
import { useTransactionStepper } from "@/hooks/useTransactionStepper";
import type { DeploymentStep } from "@/lib/transaction-stepper/types";

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
    createWithdrawalAuthorization,
    submitWithdrawal,
    waitForWithdrawalConfirmation,
    commitWithdrawalAttestation,
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
  const [isStepperOpen, setIsStepperOpen] = useState(false);
  const [stepperSteps, setStepperSteps] = useState<DeploymentStep[]>([]);

  const {
    state: stepperState,
    start: stepperStart,
    retryStep: stepperRetry,
    skipStep: stepperSkip,
    waitForSteps: stepperWaitForSteps,
    cancel: stepperCancel,
  } = useTransactionStepper(stepperSteps);

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

    if (isEASEnabled()) {
      const ctx: {
        auth?: Awaited<ReturnType<typeof createWithdrawalAuthorization>>;
        withdrawal?: any;
        attestationScanUrl?: string | null;
        proofCancelled?: boolean;
      } = {};

      const steps: DeploymentStep[] = [
        {
          id: "withdrawal-authorize",
          title: "Authorize withdrawal",
          description: "Sign a message to authorize this withdrawal.",
          execute: async () => {
            ctx.auth = await createWithdrawalAuthorization(amountNum);
            return { data: { authorized: true } };
          },
        },
        {
          id: "withdrawal-transfer",
          title: "Process withdrawal",
          description: "Submitting withdrawal and transferring DG on-chain.",
          execute: async () => {
            if (!ctx.auth) throw new Error("Missing authorization");
            ctx.withdrawal = await submitWithdrawal({
              walletAddress: ctx.auth.walletAddress,
              amountDG: amountNum,
              signature: ctx.auth.signature,
              deadline: ctx.auth.deadline,
              chainId: ctx.auth.chainId,
            });

            const hash = ctx.withdrawal.transactionHash as string;
            return {
              transactionHash: hash,
              transactionUrl: getBlockExplorerUrl(hash),
              waitForConfirmation: async () => {
                const waited = await waitForWithdrawalConfirmation(hash);
                return { receipt: waited.receipt };
              },
            };
          },
        },
        {
          id: "withdrawal-proof",
          title: "Sign withdrawal proof",
          description:
            "Optional gasless attestation for on-chain audit proof (EAS).",
          execute: async () => {
            if (!ctx.auth || !ctx.withdrawal) {
              throw new Error("Missing withdrawal context");
            }

            if (!ctx.withdrawal.attestationRequired) {
              ctx.attestationScanUrl = null;
              ctx.proofCancelled = false;
              return { data: { skipped: true } };
            }

            const payload = ctx.withdrawal.attestationPayload;
            const amount = Number(payload?.amountDg ?? amountNum);
            const withdrawalTimestamp =
              payload?.withdrawalTimestamp ?? Math.floor(Date.now() / 1000);
            const withdrawalTxHash =
              payload?.withdrawalTxHash || ctx.withdrawal.transactionHash;

            const proof = await commitWithdrawalAttestation({
              withdrawalId: ctx.withdrawal.withdrawalId,
              walletAddress: ctx.auth.walletAddress,
              amountDG: amount,
              withdrawalTimestamp,
              withdrawalTxHash,
            });

            ctx.attestationScanUrl = proof.attestationScanUrl;
            ctx.proofCancelled = proof.proofCancelled;

            return {
              data: {
                attestationScanUrl: proof.attestationScanUrl,
                proofCancelled: proof.proofCancelled,
              },
            };
          },
        },
      ];

      setStepperSteps(steps);
      setIsStepperOpen(true);
      await stepperWaitForSteps(steps.length);

      try {
        await stepperStart();
      } finally {
        setIsStepperOpen(false);
      }

      if (ctx.withdrawal?.success) {
        setIsSuccess(true);
        setAttestationScanUrl(ctx.attestationScanUrl || null);
        setProofCancelled(Boolean(ctx.proofCancelled));
        setTimeout(() => handleClose(), 3000);
      }
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
    setIsStepperOpen(false);
    onClose();
  };

  const displayError = localError || withdrawalError;

  return (
    <Transition appear show={isOpen} as="div">
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as="div"
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        />

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as="div"
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
                            disabled={isLoading || stepperState.isRunning}
                          />
                          <Button
                            type="button"
                            onClick={handleMaxClick}
                            variant="ghost"
                            className="px-3 py-2 text-sm font-medium text-flame-yellow hover:text-flame-orange"
                            disabled={isLoading || stepperState.isRunning}
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
                          disabled={
                            isLoading || stepperState.isRunning || !amount
                          }
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

      <TransactionStepperModal
        open={isStepperOpen}
        title="Process DG withdrawal"
        description="Follow the steps to complete your withdrawal. You may see wallet signature popups."
        steps={stepperState.steps}
        activeStepIndex={stepperState.activeStepIndex}
        canClose={stepperState.canClose}
        onRetry={stepperRetry}
        onSkip={stepperSkip}
        onCancel={() => {
          stepperCancel();
          setIsStepperOpen(false);
        }}
        onClose={() => setIsStepperOpen(false)}
      />
    </Transition>
  );
}
