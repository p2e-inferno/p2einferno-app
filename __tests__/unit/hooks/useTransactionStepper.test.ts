import { act, renderHook, waitFor } from "@testing-library/react";
import { useTransactionStepper } from "@/hooks/useTransactionStepper";
import type { DeploymentStep, TxResult } from "@/lib/transaction-stepper/types";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createStep(
  step: Pick<DeploymentStep, "id" | "title" | "execute"> &
    Partial<Pick<DeploymentStep, "description">>,
): DeploymentStep {
  return {
    description: step.description,
    ...step,
  };
}

describe("useTransactionStepper", () => {
  it("executes steps sequentially and marks success", async () => {
    const step1 = createDeferred<TxResult>();
    const step2 = createDeferred<TxResult>();

    const steps: DeploymentStep[] = [
      createStep({ id: "s1", title: "Step 1", execute: () => step1.promise }),
      createStep({ id: "s2", title: "Step 2", execute: () => step2.promise }),
    ];

    const { result } = renderHook(() => useTransactionStepper(steps));

    let startPromise: Promise<TxResult[]>;
    act(() => {
      startPromise = result.current.start();
    });

    expect(result.current.state.steps[0]?.phase).toBe("awaiting_wallet");
    expect(result.current.state.canClose).toBe(false);

    await act(async () => {
      step1.resolve({ transactionHash: "0x1" });
    });

    await waitFor(() => {
      expect(result.current.state.steps[0]?.phase).toBe("success");
    });
    await waitFor(() => {
      expect(result.current.state.steps[1]?.phase).toBe("awaiting_wallet");
    });

    await act(async () => {
      step2.resolve({ transactionHash: "0x2" });
    });

    const results = await startPromise!;
    expect(results).toHaveLength(2);
    expect(result.current.state.steps.every((s) => s.phase === "success")).toBe(
      true,
    );
    expect(result.current.state.canClose).toBe(true);
    expect(result.current.state.isRunning).toBe(false);
  });

  it("stops on failure and records error on the failed step", async () => {
    const step1 = createDeferred<TxResult>();
    const step2 = createDeferred<TxResult>();

    const steps: DeploymentStep[] = [
      createStep({ id: "s1", title: "Step 1", execute: () => step1.promise }),
      createStep({ id: "s2", title: "Step 2", execute: () => step2.promise }),
    ];

    const { result } = renderHook(() => useTransactionStepper(steps));

    let startPromise: Promise<TxResult[]>;
    let startOutcomePromise: Promise<
      { ok: true } | { ok: false; err: unknown }
    >;
    act(() => {
      startPromise = result.current.start();
      startOutcomePromise = startPromise.then(
        () => ({ ok: true as const }),
        (err) => ({ ok: false as const, err }),
      );
    });

    await act(async () => {
      step1.resolve({});
    });

    await waitFor(() => {
      expect(result.current.state.steps[1]?.phase).toBe("awaiting_wallet");
    });

    await act(async () => {
      step2.reject(new Error("boom"));
    });

    const outcome = await startOutcomePromise!;
    expect(outcome.ok).toBe(false);
    if (outcome.ok === false) {
      expect(outcome.err).toBeInstanceOf(Error);
      expect((outcome.err as Error).message).toBe("boom");
    }
    expect(result.current.state.steps[0]?.phase).toBe("success");
    expect(result.current.state.steps[1]?.phase).toBe("error");
    expect(result.current.state.steps[1]?.errorMessage).toMatch("boom");
    expect(result.current.state.canClose).toBe(true);
  });

  it("retries only the failed step", async () => {
    const execute1 = jest.fn(async () => ({ transactionHash: "0x1" }));
    const execute2 = jest
      .fn<Promise<TxResult>, []>()
      .mockImplementationOnce(async () => {
        throw new Error("nope");
      })
      .mockImplementationOnce(async () => ({ transactionHash: "0x2" }));

    const steps: DeploymentStep[] = [
      createStep({ id: "s1", title: "Step 1", execute: execute1 }),
      createStep({ id: "s2", title: "Step 2", execute: execute2 }),
    ];

    const { result } = renderHook(() => useTransactionStepper(steps));

    await act(async () => {
      await expect(result.current.start()).rejects.toThrow("nope");
    });

    expect(execute1).toHaveBeenCalledTimes(1);
    expect(execute2).toHaveBeenCalledTimes(1);
    expect(result.current.state.steps[0]?.phase).toBe("success");
    expect(result.current.state.steps[1]?.phase).toBe("error");

    await act(async () => {
      await result.current.retryStep();
    });

    expect(execute1).toHaveBeenCalledTimes(1);
    expect(execute2).toHaveBeenCalledTimes(2);
    expect(result.current.state.steps[0]?.phase).toBe("success");
    expect(result.current.state.steps[1]?.phase).toBe("success");
  });

  it("blocks cancel while a step is pending", async () => {
    const step1 = createDeferred<TxResult>();
    const steps: DeploymentStep[] = [
      createStep({ id: "s1", title: "Step 1", execute: () => step1.promise }),
    ];

    const { result } = renderHook(() => useTransactionStepper(steps));

    let startPromise: Promise<TxResult[]>;
    act(() => {
      startPromise = result.current.start();
    });

    expect(result.current.state.canClose).toBe(false);
    expect(result.current.state.isRunning).toBe(true);

    act(() => {
      result.current.cancel();
    });

    expect(result.current.state.isRunning).toBe(true);

    await act(async () => {
      step1.resolve({});
    });

    await expect(startPromise!).resolves.toHaveLength(1);
    expect(result.current.state.canClose).toBe(true);
  });

  describe("waitForSteps with afterVersion", () => {
    it("resolves immediately when version has already advanced", async () => {
      const steps: DeploymentStep[] = [
        createStep({
          id: "s1",
          title: "Step 1",
          execute: async () => ({}),
        }),
      ];

      const { result } = renderHook(() => useTransactionStepper(steps));

      // stepsVersion starts > 0 after initial useEffect, so afterVersion: 0
      // should resolve immediately.
      await act(async () => {
        await result.current.waitForSteps(1, 0);
      });
    });

    it("waits for new steps when same count but afterVersion matches current", async () => {
      const execute1 = jest.fn(async () => ({ transactionHash: "0x1" }));
      const execute2 = jest.fn(async () => ({ transactionHash: "0x2" }));

      const initialSteps: DeploymentStep[] = [
        createStep({ id: "s1", title: "Step 1", execute: execute1 }),
      ];

      const { result, rerender } = renderHook(
        ({ steps }) => useTransactionStepper(steps),
        { initialProps: { steps: initialSteps } },
      );

      // Snapshot version before providing new steps
      const versionBefore = result.current.stepsVersion.current;

      const newSteps: DeploymentStep[] = [
        createStep({ id: "s1", title: "Step 1", execute: execute2 }),
      ];

      // Rerender with new steps (same count, same IDs)
      rerender({ steps: newSteps });

      // waitForSteps with afterVersion should wait until version advances
      await act(async () => {
        await result.current.waitForSteps(1, versionBefore);
      });

      // Version should have advanced
      expect(result.current.stepsVersion.current).toBeGreaterThan(
        versionBefore,
      );

      // start() should execute the NEW step, not the old one
      await act(async () => {
        await result.current.start();
      });

      expect(execute1).not.toHaveBeenCalled();
      expect(execute2).toHaveBeenCalledTimes(1);
    });

    it("times out when steps never update", async () => {
      const steps: DeploymentStep[] = [
        createStep({
          id: "s1",
          title: "Step 1",
          execute: async () => ({}),
        }),
      ];

      const { result } = renderHook(() => useTransactionStepper(steps));

      // Use a version far in the future — will never be reached
      await expect(
        act(async () => {
          await result.current.waitForSteps(1, 999999);
        }),
      ).rejects.toThrow("Stepper is not ready yet");
    });
  });
});
