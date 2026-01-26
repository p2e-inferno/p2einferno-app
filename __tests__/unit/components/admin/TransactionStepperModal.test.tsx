import { render, screen, fireEvent } from "@testing-library/react";
import { TransactionStepperModal } from "@/components/admin/TransactionStepperModal";
import type { StepRuntimeState } from "@/lib/transaction-stepper/types";

describe("TransactionStepperModal", () => {
  it("disables close controls while pending", () => {
    const steps: StepRuntimeState[] = [
      {
        id: "s1",
        title: "Deploy & configure lock",
        description: "Test description",
        phase: "awaiting_wallet",
      },
    ];

    const onClose = jest.fn();
    const onCancel = jest.fn();
    const onRetry = jest.fn();

    render(
      <TransactionStepperModal
        open={true}
        title="Deploy bootcamp lock"
        steps={steps}
        activeStepIndex={0}
        canClose={false}
        onRetry={onRetry}
        onSkip={jest.fn()}
        onCancel={onCancel}
        onClose={onClose}
      />,
    );

    expect(screen.getByText("Deploy bootcamp lock")).toBeInTheDocument();
    expect(
      screen.getByText("Awaiting wallet confirmation"),
    ).toBeInTheDocument();

    const closeButton = screen.getByRole("button", { name: /close/i });
    expect(closeButton).toBeDisabled();

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    expect(cancelButton).toBeDisabled();

    fireEvent.click(closeButton);
    fireEvent.click(cancelButton);
    expect(onClose).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("shows tx hash and links when url is provided", () => {
    const steps: StepRuntimeState[] = [
      {
        id: "s1",
        title: "Step 1",
        phase: "submitted",
        transactionHash: "0xabc",
        transactionUrl: "https://explorer/tx/0xabc",
      },
    ];

    render(
      <TransactionStepperModal
        open={true}
        title="Deploy lock"
        steps={steps}
        activeStepIndex={0}
        canClose={false}
        onRetry={() => {}}
        onSkip={() => {}}
        onCancel={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("Transaction hash")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "0xabc" });
    expect(link).toHaveAttribute("href", "https://explorer/tx/0xabc");
  });

  it("shows retry only when a step failed", () => {
    const steps: StepRuntimeState[] = [
      {
        id: "s1",
        title: "Step 1",
        phase: "error",
        errorMessage: "User rejected",
      },
    ];

    const onRetry = jest.fn();
    const onCancel = jest.fn();

    render(
      <TransactionStepperModal
        open={true}
        title="Deploy lock"
        steps={steps}
        activeStepIndex={0}
        canClose={true}
        onRetry={onRetry}
        onSkip={jest.fn()}
        onCancel={onCancel}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("Step failed")).toBeInTheDocument();
    expect(screen.getByText("User rejected")).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: /retry step/i });
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelButton);
    expect(onCancel).toHaveBeenCalledTimes(1);

    expect(
      screen.queryByRole("button", { name: /done/i }),
    ).not.toBeInTheDocument();
  });

  it("shows done only when all steps succeed", () => {
    const steps: StepRuntimeState[] = [
      { id: "s1", title: "Step 1", phase: "success" },
      { id: "s2", title: "Step 2", phase: "success" },
    ];

    const onClose = jest.fn();

    render(
      <TransactionStepperModal
        open={true}
        title="Deploy lock"
        steps={steps}
        activeStepIndex={1}
        canClose={true}
        onRetry={() => {}}
        onSkip={() => {}}
        onCancel={() => {}}
        onClose={onClose}
      />,
    );

    const doneButton = screen.getByRole("button", { name: /done/i });
    fireEvent.click(doneButton);
    expect(onClose).toHaveBeenCalledTimes(1);

    expect(
      screen.queryByRole("button", { name: /retry step/i }),
    ).not.toBeInTheDocument();
  });
});
