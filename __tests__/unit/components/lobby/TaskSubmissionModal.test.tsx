import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TaskSubmissionModal from "@/components/lobby/TaskSubmissionModal";
import { toast } from "react-hot-toast";

// Mock dependencies
jest.mock("react-hot-toast", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
}));

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const mockTask = {
  id: "task-123",
  title: "Test Task",
  description: "Task description",
  task_type: "url_submission",
  reward_amount: 100,
  submission_requirements: {},
  validation_criteria: {},
  requires_admin_review: false,
};

describe("TaskSubmissionModal", () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    task: mockTask,
    onSubmissionSuccess: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("should not render when isOpen is false", () => {
    const { container } = render(
      <TaskSubmissionModal {...defaultProps} isOpen={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("should render correctly when open", () => {
    render(<TaskSubmissionModal {...defaultProps} />);
    expect(
      screen.getByRole("heading", { name: "Submit Task" }),
    ).toBeInTheDocument();
    expect(screen.getByText(mockTask.title)).toBeInTheDocument();
    expect(screen.getByText(mockTask.description)).toBeInTheDocument();
  });

  describe("URL Submission", () => {
    it("should handle valid URL submission", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<TaskSubmissionModal {...defaultProps} />);

      const input = screen.getByLabelText("Submission URL");
      await userEvent.type(input, "https://example.com");

      const submitButton = screen.getByRole("button", { name: "Submit Task" });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });

      const call = (global.fetch as jest.Mock).mock.calls[0];
      expect(call[0]).toBe(`/api/user/task/${mockTask.id}/submit`);

      const body = JSON.parse(call[1].body);
      expect(body).toMatchObject({
        submission_type: "url_submission",
        submission_data: { url: "https://example.com" },
        submission_url: "https://example.com",
      });

      expect(toast.success).toHaveBeenCalledWith(
        "Task submitted successfully!",
      );
      expect(defaultProps.onSubmissionSuccess).toHaveBeenCalled();
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it("should validate empty URL", async () => {
      render(<TaskSubmissionModal {...defaultProps} />);
      const submitButton = screen.getByRole("button", { name: "Submit Task" });
      await userEvent.click(submitButton);
      expect(toast.error).toHaveBeenCalledWith("Please provide a valid URL");
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("Text Submission", () => {
    const textTask = { ...mockTask, task_type: "text_submission" };

    it("should handle valid text submission", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<TaskSubmissionModal {...defaultProps} task={textTask} />);

      const input = screen.getByLabelText("Your Submission");
      await userEvent.type(input, "Here is my answer");

      const submitButton = screen.getByRole("button", { name: "Submit Task" });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });

      const call = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body).toMatchObject({
        submission_type: "text_submission",
        submission_data: { text: "Here is my answer" },
      });
    });
  });

  describe("Contract Interaction", () => {
    const contractTask = { ...mockTask, task_type: "contract_interaction" };

    it("should handle contract interaction submission", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<TaskSubmissionModal {...defaultProps} task={contractTask} />);

      await userEvent.type(screen.getByLabelText("Transaction Hash"), "0x123");
      await userEvent.type(
        screen.getByLabelText("Contract Address"),
        "0xContract",
      );
      await userEvent.type(screen.getByLabelText("Function Called"), "mint");

      const submitButton = screen.getByRole("button", { name: "Submit Task" });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });

      const call = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body).toMatchObject({
        submission_type: "contract_interaction",
        submission_data: {
          transaction_hash: "0x123",
          contract_address: "0xContract",
          function_called: "mint",
        },
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle API errors", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Server error" }),
      });

      render(<TaskSubmissionModal {...defaultProps} />);

      const input = screen.getByLabelText("Submission URL");
      await userEvent.type(input, "https://example.com");

      const submitButton = screen.getByRole("button", { name: "Submit Task" });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Server error");
      });
    });
  });
});
