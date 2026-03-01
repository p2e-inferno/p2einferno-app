/**
 * LightUpButton Component
 *
 * Button to execute the Light Up action in the vendor contract.
 * Burns tokens to gain fuel and points.
 */

import { useDGLightUp } from "@/hooks/vendor/useDGLightUp";
import { Button } from "@/components/ui/button";
import { Flame } from "lucide-react";
import { useDGVendorAccess } from "@/hooks/vendor/useDGVendorAccess";
import { TransactionStepperModal } from "@/components/admin/TransactionStepperModal";
import { useTransactionStepper } from "@/hooks/useTransactionStepper";
import type { DeploymentStep } from "@/lib/transaction-stepper/types";
import { useTokenApproval } from "@/hooks/useTokenApproval";
import { useCallback, useMemo, useState } from "react";
import { formatWalletAddress } from "@/lib/utils/wallet-address";

const VENDOR_ADDRESS = process.env
  .NEXT_PUBLIC_DG_VENDOR_ADDRESS as `0x${string}`;

export default function LightUpButton() {
  const {
    baseTokenAddress,
    burnAmount,
    currentStage,
    isLoadingConfig,
    canLightUp,
    executeLightUpTx,
  } = useDGLightUp();
  const { approveIfNeededTx } = useTokenApproval();
  const {
    isKeyHolder,
    isPaused,
    hasKeyOnAnotherLinkedWallet,
    keyHoldingWalletAddress,
    activeWalletAddress,
  } = useDGVendorAccess();

  const [isStepperOpen, setIsStepperOpen] = useState(false);
  const [stepperSteps, setStepperSteps] = useState<DeploymentStep[]>([]);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  const {
    state: stepperState,
    start: stepperStart,
    retryStep: stepperRetry,
    skipStep: stepperSkip,
    waitForSteps: stepperWaitForSteps,
    cancel: stepperCancel,
  } = useTransactionStepper(stepperSteps);

  const stepperTitle = "Light Up";
  const stepperDescription = useMemo(
    () =>
      "Approves the burn amount (if needed), then submits the Light Up transaction.",
    [],
  );

  const blockedReason = !isKeyHolder
    ? hasKeyOnAnotherLinkedWallet && keyHoldingWalletAddress
      ? `You’re connected as ${formatWalletAddress(
          activeWalletAddress,
        )}. Membership is on ${formatWalletAddress(
          keyHoldingWalletAddress,
        )} — switch to light up.`
      : "Valid NFT key required to light up."
    : isPaused
      ? "Vendor is paused."
      : isLoadingConfig
        ? "Loading burn configuration..."
        : !VENDOR_ADDRESS
          ? "Vendor address not configured."
          : !baseTokenAddress
            ? "Token config unavailable."
            : !canLightUp
              ? "Burn amount unavailable."
              : null;

  const handleLightUp = useCallback(async () => {
    if (blockedReason) return;
    if (!baseTokenAddress || !burnAmount || burnAmount <= 0n) return;

    setLastTxHash(null);
    const steps: DeploymentStep[] = [
      {
        id: "lightup:approve",
        title: "Approve UP burn",
        description:
          "Approve the vendor to spend the burn amount of UP (if needed).",
        execute: async () =>
          approveIfNeededTx({
            tokenAddress: baseTokenAddress,
            spenderAddress: VENDOR_ADDRESS,
            amount: burnAmount,
          }),
      },
      {
        id: "lightup:submit",
        title: "Light Up",
        description: `Stage ${currentStage}: submit the Light Up burn transaction.`,
        execute: async () => executeLightUpTx(),
      },
    ];

    setStepperSteps(steps);
    setIsStepperOpen(true);

    let stepperReady = false;
    try {
      await stepperWaitForSteps(steps.length);
      stepperReady = true;

      const results = await stepperStart();
      const tx = results?.[1]?.transactionHash;
      if (tx) setLastTxHash(tx);
    } catch {
      if (!stepperReady) {
        setIsStepperOpen(false);
      }
    } finally {
      // keep modal open for "Done"/error actions
    }
  }, [
    approveIfNeededTx,
    baseTokenAddress,
    blockedReason,
    burnAmount,
    currentStage,
    executeLightUpTx,
    stepperStart,
    stepperWaitForSteps,
  ]);

  return (
    <div className="rounded-2xl border border-orange-500/40 bg-gradient-to-b from-slate-900/90 via-slate-900/70 to-slate-900/60 p-6 shadow-2xl shadow-black/40">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <Flame className="h-5 w-5 text-orange-400" />
        Light Up
      </h4>

      <p className="mb-4 text-xs text-slate-300">
        Burn DG tokens to gain fuel and points for stage progression.
      </p>

      <Button
        onClick={() => handleLightUp()}
        disabled={
          isStepperOpen ||
          stepperState.isRunning ||
          !!blockedReason ||
          !canLightUp
        }
        className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-red-500 font-semibold text-black hover:from-orange-600 hover:to-red-600"
      >
        {stepperState.isRunning ? (
          <span className="flex items-center gap-2">
            <span className="animate-spin">🔥</span>
            Working...
          </span>
        ) : (
          "Light Up 🔥"
        )}
      </Button>

      {lastTxHash ? (
        <p className="mt-2 text-xs text-emerald-400">
          Submitted! Tx: {lastTxHash.slice(0, 10)}...
        </p>
      ) : null}
      {blockedReason && (
        <p className="mt-2 text-xs text-red-400 text-center">{blockedReason}</p>
      )}

      <TransactionStepperModal
        open={isStepperOpen}
        title={stepperTitle}
        description={stepperDescription}
        steps={stepperState.steps}
        activeStepIndex={stepperState.activeStepIndex}
        canClose={stepperState.canClose}
        onRetry={() => {
          void stepperRetry().catch(() => {});
        }}
        onSkip={() => {
          void stepperSkip().catch(() => {});
        }}
        onCancel={() => {
          stepperCancel();
          if (stepperState.canClose) setIsStepperOpen(false);
        }}
        onClose={() => {
          if (!stepperState.canClose) return;
          setIsStepperOpen(false);
        }}
      />
    </div>
  );
}
