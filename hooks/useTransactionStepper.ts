"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DeploymentStep,
  StepPhase,
  StepRuntimeState,
  TxResult,
} from "@/lib/transaction-stepper/types";

type UseTransactionStepperState = {
  steps: StepRuntimeState[];
  activeStepIndex: number;
  isRunning: boolean;
  canClose: boolean;
};

const PENDING_PHASES: StepPhase[] = ["awaiting_wallet", "submitted", "confirming"];

function isPendingPhase(phase: StepPhase) {
  return PENDING_PHASES.includes(phase);
}

function createInitialRuntimeState(steps: DeploymentStep[]): StepRuntimeState[] {
  return steps.map((step) => ({
    id: step.id,
    title: step.title,
    description: step.description,
    canSkipOnError: step.canSkipOnError,
    skipLabel: step.skipLabel,
    phase: "idle",
  }));
}

function getFirstIndexByPhase(
  steps: StepRuntimeState[],
  phase: StepPhase,
): number {
  return steps.findIndex((s) => s.phase === phase);
}

function getFailedStepIndex(steps: StepRuntimeState[]): number {
  return getFirstIndexByPhase(steps, "error");
}

function getCanClose(steps: StepRuntimeState[]) {
  return !steps.some((s) => isPendingPhase(s.phase));
}

export function useTransactionStepper(steps: DeploymentStep[]) {
  const stepsRef = useRef<DeploymentStep[]>(steps);
  const [runtimeSteps, setRuntimeSteps] = useState<StepRuntimeState[]>(() =>
    createInitialRuntimeState(stepsRef.current),
  );
  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [isRunning, setIsRunning] = useState(false);

  const runIdRef = useRef(0);
  const runtimeStepCountRef = useRef(runtimeSteps.length);
  // Monotonic version counter — increments every time useEffect installs new steps.
  // Callers snapshot this before setting new steps, then waitForSteps polls until
  // the version has advanced, guaranteeing stepsRef.current points to the new steps.
  const stepsVersionRef = useRef(0);

  useEffect(() => {
    stepsRef.current = steps;
    stepsVersionRef.current += 1;
    setRuntimeSteps(createInitialRuntimeState(steps));
    setActiveStepIndex(steps.length > 0 ? 0 : -1);
    setIsRunning(false);
  }, [steps]);

  useEffect(() => {
    runtimeStepCountRef.current = runtimeSteps.length;
  }, [runtimeSteps.length]);

  const waitForSteps = useCallback(
    async (expectedCount: number, afterVersion?: number) => {
      const deadline = Date.now() + 5000;
      while (
        runtimeStepCountRef.current < expectedCount ||
        (afterVersion !== undefined &&
          stepsVersionRef.current <= afterVersion)
      ) {
        if (Date.now() > deadline) {
          throw new Error("Stepper is not ready yet");
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },
    [],
  );

  const updateStep = useCallback(
    (
      index: number,
      patch: Partial<Omit<StepRuntimeState, "id" | "title" | "description">>,
    ) => {
      setRuntimeSteps((prev) => {
        if (index < 0 || index >= prev.length) return prev;
        const next = [...prev];
        next[index] = { ...next[index], ...patch } as StepRuntimeState;
        return next;
      });
    },
    [],
  );

  const runFromIndex = useCallback(
    async (startIndex: number): Promise<TxResult[]> => {
      const runId = ++runIdRef.current;
      const results: TxResult[] = [];

      const activeSteps = stepsRef.current;
      for (let index = startIndex; index < activeSteps.length; index += 1) {
        if (runIdRef.current !== runId) {
          throw new Error("Stepper run cancelled");
        }

        const step = activeSteps[index];
        if (!step) {
          throw new Error("Stepper step missing");
        }

        setActiveStepIndex(index);
          updateStep(index, {
            phase: "awaiting_wallet",
            errorMessage: undefined,
            startedAt: Date.now(),
            endedAt: undefined,
            transactionHash: undefined,
            result: undefined,
          });

          try {
            const result = await step.execute();
            results[index] = result;

            if (result?.transactionHash) {
              updateStep(index, {
                phase: "submitted",
                transactionHash: result.transactionHash,
                transactionUrl: result.transactionUrl,
              });
            }

            let finalResult = result;

            if (result?.waitForConfirmation) {
              updateStep(index, { phase: "confirming" });
              const waited = await result.waitForConfirmation();
              if (waited) {
                finalResult = {
                  ...finalResult,
                  ...waited,
                  transactionHash:
                    waited.transactionHash ?? finalResult?.transactionHash,
                  transactionUrl:
                    waited.transactionUrl ?? finalResult?.transactionUrl,
                };
                results[index] = finalResult;
                if (waited.transactionHash || waited.transactionUrl) {
                  updateStep(index, {
                    transactionHash:
                      waited.transactionHash ?? finalResult.transactionHash,
                    transactionUrl:
                      waited.transactionUrl ?? finalResult.transactionUrl,
                  });
                }
              }
            }

            updateStep(index, {
              phase: "success",
              endedAt: Date.now(),
              result: finalResult,
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            updateStep(index, {
              phase: "error",
              errorMessage: message,
            endedAt: Date.now(),
          });
          throw err;
        }
      }

      return results;
    },
    [updateStep],
  );

  const start = useCallback(async (): Promise<TxResult[]> => {
    if (isRunning) return [];
    setIsRunning(true);
    setRuntimeSteps(createInitialRuntimeState(stepsRef.current));
    setActiveStepIndex(stepsRef.current.length > 0 ? 0 : -1);

    try {
      const results = await runFromIndex(0);
      return results;
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, runFromIndex]);

  const retryStep = useCallback(async (): Promise<TxResult[]> => {
    if (isRunning) return [];

    const failedIndex = getFailedStepIndex(runtimeSteps);
    if (failedIndex === -1) return [];

    setIsRunning(true);
    try {
      const results = await runFromIndex(failedIndex);
      return results;
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, runFromIndex, runtimeSteps]);

  const skipStep = useCallback(async (): Promise<TxResult[]> => {
    if (isRunning) return [];

    const failedIndex = getFailedStepIndex(runtimeSteps);
    if (failedIndex === -1) return [];

    const failedStep = runtimeSteps[failedIndex];
    if (!failedStep?.canSkipOnError) {
      throw new Error("This step cannot be skipped");
    }

    setIsRunning(true);
    updateStep(failedIndex, {
      phase: "skipped",
      errorMessage: undefined,
      endedAt: Date.now(),
      result: { data: { skipped: true } },
    });

    try {
      if (failedIndex + 1 >= stepsRef.current.length) return [];
      return await runFromIndex(failedIndex + 1);
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, runFromIndex, runtimeSteps, updateStep]);

  const cancel = useCallback(() => {
    const canClose = getCanClose(runtimeSteps);
    if (!canClose) return;
    runIdRef.current += 1; // invalidate in-flight run
    setIsRunning(false);
  }, [runtimeSteps]);

  const state: UseTransactionStepperState = useMemo(
    () => ({
      steps: runtimeSteps,
      activeStepIndex,
      isRunning,
      canClose: getCanClose(runtimeSteps),
    }),
    [activeStepIndex, isRunning, runtimeSteps],
  );

  return {
    start,
    retryStep,
    skipStep,
    waitForSteps,
    cancel,
    state,
    stepsVersion: stepsVersionRef,
  };
}
