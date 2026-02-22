import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import TaskItem from "@/components/quests/TaskItem";

jest.mock("next/image", () => {
  return function MockImage(props: any) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={props.alt || ""} src={props.src || ""} />;
  };
});

jest.mock("@/components/common/RichText", () => ({
  RichText: ({
    content,
    className,
  }: {
    content: string;
    className?: string;
  }) => <div className={className}>{content}</div>,
}));

jest.mock("@/components/quests/DeployLockTaskForm", () => ({
  DeployLockTaskForm: () => <div>DeployLockTaskForm</div>,
}));

describe("TaskItem vendor tx input flow", () => {
  const validTxHash = `0x${"a".repeat(64)}`;

  const baseTask: any = {
    id: "task-1",
    title: "Sell DG",
    description: "Submit vendor sell tx hash",
    task_type: "vendor_sell",
    reward_amount: 50,
    input_required: false,
    input_validation: "text",
    requires_admin_review: false,
    task_config: {},
  };

  it("renders tx hash input for vendor tx tasks even when input_required is false", () => {
    render(
      <TaskItem
        task={baseTask}
        completion={undefined}
        isQuestStarted={true}
        questId="quest-1"
        onAction={jest.fn()}
        onClaimReward={jest.fn()}
        processingTaskId={null}
      />,
    );

    expect(screen.getByLabelText("Transaction Hash")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Complete Task" }),
    ).toBeDisabled();
  });

  it("submits tx hash through onAction for vendor tx tasks", () => {
    const onAction = jest.fn();

    render(
      <TaskItem
        task={baseTask}
        completion={undefined}
        isQuestStarted={true}
        questId="quest-1"
        onAction={onAction}
        onClaimReward={jest.fn()}
        processingTaskId={null}
      />,
    );

    fireEvent.change(screen.getByLabelText("Transaction Hash"), {
      target: { value: validTxHash },
    });
    fireEvent.click(screen.getByRole("button", { name: "Complete Task" }));

    expect(onAction).toHaveBeenCalledWith(baseTask, validTxHash);
  });

  it("keeps button disabled for invalid tx hash format", () => {
    render(
      <TaskItem
        task={baseTask}
        completion={undefined}
        isQuestStarted={true}
        questId="quest-1"
        onAction={jest.fn()}
        onClaimReward={jest.fn()}
        processingTaskId={null}
      />,
    );

    fireEvent.change(screen.getByLabelText("Transaction Hash"), {
      target: { value: "0xabc" },
    });

    expect(
      screen.getByRole("button", { name: "Complete Task" }),
    ).toBeDisabled();
  });

  it("renders tx hash fallback for deploy_lock when task_config is missing", () => {
    const deployLockTask = {
      ...baseTask,
      id: "task-2",
      task_type: "deploy_lock",
      task_config: null,
    };

    render(
      <TaskItem
        task={deployLockTask}
        completion={undefined}
        isQuestStarted={true}
        questId="quest-1"
        onAction={jest.fn()}
        onClaimReward={jest.fn()}
        processingTaskId={null}
      />,
    );

    expect(screen.getByLabelText("Transaction Hash")).toBeInTheDocument();
  });

  it("does not prefill from legacy verification_data.transactionHash", () => {
    const completion = {
      id: "completion-1",
      task_id: "task-1",
      submission_status: "retry",
      reward_claimed: false,
      verification_data: { transactionHash: validTxHash },
      submission_data: null,
    } as any;

    render(
      <TaskItem
        task={baseTask}
        completion={completion}
        isQuestStarted={true}
        questId="quest-1"
        onAction={jest.fn()}
        onClaimReward={jest.fn()}
        processingTaskId={null}
      />,
    );

    expect(screen.getByLabelText("Transaction Hash")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Resubmit" })).toBeDisabled();
  });
});
