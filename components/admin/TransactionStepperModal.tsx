"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  StepRuntimeState,
  StepPhase,
} from "@/lib/transaction-stepper/types";
import {
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  SkipForward,
  TriangleAlert,
  XCircle,
} from "lucide-react";

export type TransactionStepperModalProps = {
  open: boolean;
  title: string;
  description?: string;
  steps: StepRuntimeState[];
  activeStepIndex: number;
  canClose: boolean;
  onRetry: () => void;
  onSkip: () => void;
  onCancel: () => void;
  onClose: () => void;
};

function getPhaseLabel(phase: StepPhase) {
  switch (phase) {
    case "idle":
      return "Idle";
    case "awaiting_wallet":
      return "Awaiting wallet confirmation";
    case "submitted":
      return "Transaction submitted";
    case "confirming":
      return "Confirming on-chain";
    case "success":
      return "Confirmed";
    case "skipped":
      return "Skipped";
    case "error":
      return "Error";
  }
}

function PhaseIcon({ phase }: { phase: StepPhase }) {
  switch (phase) {
    case "idle":
      return <Circle className="h-5 w-5 text-slate-500" />;
    case "awaiting_wallet":
      return <Clock className="h-5 w-5 text-amber-400" />;
    case "submitted":
      return <Loader2 className="h-5 w-5 text-sky-400 animate-spin" />;
    case "confirming":
      return <Loader2 className="h-5 w-5 text-sky-400 animate-spin" />;
    case "success":
      return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
    case "skipped":
      return <SkipForward className="h-5 w-5 text-slate-300" />;
    case "error":
      return <XCircle className="h-5 w-5 text-red-400" />;
  }
}

export function TransactionStepperModal({
  open,
  title,
  description,
  steps,
  activeStepIndex,
  canClose,
  onRetry,
  onSkip,
  onCancel,
  onClose,
}: TransactionStepperModalProps) {
  const failedStep = steps.find((s) => s.phase === "error");
  const allDone =
    steps.length > 0 &&
    steps.every((s) => s.phase === "success" || s.phase === "skipped");

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !canClose) return;
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        className="bg-slate-950 border border-slate-800 text-slate-100 sm:max-w-xl"
        canClose={canClose}
      >
        <DialogHeader>
          <DialogTitle className="text-slate-100">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-slate-300">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="mt-4 space-y-3">
          {steps.map((step, index) => {
            const isActive = index === activeStepIndex;
            return (
              <div
                key={step.id}
                className={`rounded-lg border p-3 ${
                  step.phase === "error"
                    ? "border-red-800 bg-red-950/30"
                    : isActive
                      ? "border-slate-700 bg-slate-900/40"
                      : "border-slate-800 bg-slate-950"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <PhaseIcon phase={step.phase} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-100 truncate">
                          {step.title}
                        </div>
                        {step.description ? (
                          <div className="text-xs text-slate-400 mt-0.5">
                            {step.description}
                          </div>
                        ) : null}
                      </div>
                      <div
                        className={`text-xs whitespace-nowrap ${
                          step.phase === "error"
                            ? "text-red-300"
                            : step.phase === "success"
                              ? "text-emerald-300"
                              : step.phase === "skipped"
                                ? "text-slate-300"
                                : isActive
                                  ? "text-sky-300"
                                  : "text-slate-400"
                        }`}
                      >
                        {getPhaseLabel(step.phase)}
                      </div>
                    </div>

                    {step.transactionHash ? (
                      <div className="mt-2 text-xs">
                        <div className="text-slate-400">Transaction hash</div>
                        {step.transactionUrl ? (
                          <a
                            href={step.transactionUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 block font-mono text-slate-200 break-all select-text underline hover:text-slate-100"
                          >
                            {step.transactionHash}
                          </a>
                        ) : (
                          <div className="mt-1 font-mono text-slate-200 break-all select-text">
                            {step.transactionHash}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {step.phase === "error" && step.errorMessage ? (
                      <div className="mt-2 rounded border border-red-900 bg-red-950/40 p-2">
                        <div className="flex items-center gap-2 text-red-300 text-xs font-medium">
                          <TriangleAlert className="h-4 w-4" />
                          Step failed
                        </div>
                        <div className="mt-1 text-xs font-mono text-red-200 whitespace-pre-wrap select-text max-h-24 overflow-y-auto">
                          {step.errorMessage}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="mt-6">
          {failedStep ? (
            <>
              <Button
                variant="outline"
                className="border-slate-700 text-slate-100 hover:bg-slate-900"
                onClick={onCancel}
                disabled={!canClose}
              >
                Cancel
              </Button>
              {failedStep.canSkipOnError ? (
                <Button
                  variant="outline"
                  className="border-slate-700 text-slate-100 hover:bg-slate-900"
                  onClick={onSkip}
                  disabled={!canClose}
                >
                  {failedStep.skipLabel || "Skip step"}
                </Button>
              ) : null}
              <Button
                className="bg-steel-red hover:bg-steel-red/90 text-white"
                onClick={onRetry}
              >
                Retry step
              </Button>
            </>
          ) : allDone ? (
            <Button
              className="bg-steel-red hover:bg-steel-red/90 text-white"
              onClick={onClose}
            >
              Done
            </Button>
          ) : (
            <Button
              variant="outline"
              className="border-slate-700 text-slate-100 hover:bg-slate-900"
              onClick={onCancel}
              disabled={!canClose}
            >
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
