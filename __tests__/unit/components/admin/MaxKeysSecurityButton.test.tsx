import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MaxKeysSecurityButton from "@/components/admin/MaxKeysSecurityButton";
import { toast } from "react-hot-toast";

jest.mock("react-hot-toast");
jest.mock("@/hooks/unlock/useUpdateMaxKeysPerAddress");
jest.mock("@/hooks/useAdminApi");
jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

describe("MaxKeysSecurityButton", () => {
  const defaultProps = {
    entityType: "milestone" as const,
    entityId: "milestone-123",
    lockAddress: "0x1234567890abcdef1234567890abcdef12345678",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const {
      useUpdateMaxKeysPerAddress,
    } = require("@/hooks/unlock/useUpdateMaxKeysPerAddress");
    useUpdateMaxKeysPerAddress.mockReturnValue({
      updateMaxKeysPerAddress: jest.fn(),
      isLoading: false,
    });
    const { useAdminApi } = require("@/hooks/useAdminApi");
    useAdminApi.mockReturnValue({ adminFetch: jest.fn() });
  });

  describe("render modes", () => {
    it("renders compact button when compact=true", () => {
      render(<MaxKeysSecurityButton {...defaultProps} compact={true} />);
      const button = screen.getByRole("button", { name: /secure lock/i });
      expect(button).toHaveClass("border-orange-700");
    });

    it("renders full alert panel when compact=false", () => {
      render(<MaxKeysSecurityButton {...defaultProps} compact={false} />);
      expect(screen.getByText("Security Risk")).toBeInTheDocument();
      expect(
        screen.getByText(/vulnerable to unauthorized access/i),
      ).toBeInTheDocument();
    });

    it("displays maxKeysFailureReason when provided", () => {
      render(
        <MaxKeysSecurityButton
          {...defaultProps}
          maxKeysFailureReason="Previous failure"
        />,
      );
      expect(screen.getByText("Previous failure")).toBeInTheDocument();
    });
  });

  describe("successful workflow", () => {
    it("successfully secures lock and updates database for milestone", async () => {
      const mockUpdate = jest
        .fn()
        .mockResolvedValue({ success: true, transactionHash: "0xtxhash" });
      const mockAdminFetch = jest.fn().mockResolvedValue({ error: null });

      const {
        useUpdateMaxKeysPerAddress,
      } = require("@/hooks/unlock/useUpdateMaxKeysPerAddress");
      useUpdateMaxKeysPerAddress.mockReturnValue({
        updateMaxKeysPerAddress: mockUpdate,
        isLoading: false,
      });
      const { useAdminApi } = require("@/hooks/useAdminApi");
      useAdminApi.mockReturnValue({ adminFetch: mockAdminFetch });

      const onSuccess = jest.fn();
      render(<MaxKeysSecurityButton {...defaultProps} onSuccess={onSuccess} />);

      const button = screen.getByRole("button", { name: /secure lock/i });
      await userEvent.click(button);

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith({
          lockAddress: defaultProps.lockAddress,
        });
        expect(mockAdminFetch).toHaveBeenCalledWith("/api/admin/milestones", {
          method: "PUT",
          body: JSON.stringify({
            id: defaultProps.entityId,
            max_keys_secured: true,
            max_keys_failure_reason: null,
          }),
        });
        expect(toast.success).toHaveBeenCalledWith(
          "Lock secured successfully!",
          { id: "secure-max-keys" },
        );
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it("calls correct endpoint for quest", async () => {
      const mockUpdate = jest
        .fn()
        .mockResolvedValue({ success: true, transactionHash: "0xtxhash" });
      const mockAdminFetch = jest.fn().mockResolvedValue({ error: null });

      const {
        useUpdateMaxKeysPerAddress,
      } = require("@/hooks/unlock/useUpdateMaxKeysPerAddress");
      useUpdateMaxKeysPerAddress.mockReturnValue({
        updateMaxKeysPerAddress: mockUpdate,
        isLoading: false,
      });
      const { useAdminApi } = require("@/hooks/useAdminApi");
      useAdminApi.mockReturnValue({ adminFetch: mockAdminFetch });

      render(
        <MaxKeysSecurityButton
          {...defaultProps}
          entityType="quest"
          entityId="quest-456"
        />,
      );

      const button = screen.getByRole("button", { name: /secure lock/i });
      await userEvent.click(button);

      await waitFor(() => {
        expect(mockAdminFetch).toHaveBeenCalledWith(
          "/api/admin/quests/quest-456",
          expect.objectContaining({ method: "PATCH" }),
        );
      });
    });

    it("calls correct endpoint for bootcamp", async () => {
      const mockUpdate = jest
        .fn()
        .mockResolvedValue({ success: true, transactionHash: "0xtxhash" });
      const mockAdminFetch = jest.fn().mockResolvedValue({ error: null });

      const {
        useUpdateMaxKeysPerAddress,
      } = require("@/hooks/unlock/useUpdateMaxKeysPerAddress");
      useUpdateMaxKeysPerAddress.mockReturnValue({
        updateMaxKeysPerAddress: mockUpdate,
        isLoading: false,
      });
      const { useAdminApi } = require("@/hooks/useAdminApi");
      useAdminApi.mockReturnValue({ adminFetch: mockAdminFetch });

      render(
        <MaxKeysSecurityButton
          {...defaultProps}
          entityType="bootcamp"
          entityId="bootcamp-789"
        />,
      );

      const button = screen.getByRole("button", { name: /secure lock/i });
      await userEvent.click(button);

      await waitFor(() => {
        expect(mockAdminFetch).toHaveBeenCalledWith(
          "/api/admin/bootcamps/bootcamp-789",
          expect.objectContaining({ method: "PUT" }),
        );
      });
    });
  });

  describe("error handling", () => {
    it("handles blockchain update failure", async () => {
      const mockUpdate = jest
        .fn()
        .mockResolvedValue({ success: false, error: "TX reverted" });
      const {
        useUpdateMaxKeysPerAddress,
      } = require("@/hooks/unlock/useUpdateMaxKeysPerAddress");
      useUpdateMaxKeysPerAddress.mockReturnValue({
        updateMaxKeysPerAddress: mockUpdate,
        isLoading: false,
      });

      const onError = jest.fn();
      render(<MaxKeysSecurityButton {...defaultProps} onError={onError} />);

      await userEvent.click(
        screen.getByRole("button", { name: /secure lock/i }),
      );

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("TX reverted", {
          id: "secure-max-keys",
        });
        expect(onError).toHaveBeenCalledWith("TX reverted");
      });
    });

    it("handles database update failure after blockchain success", async () => {
      const mockUpdate = jest
        .fn()
        .mockResolvedValue({ success: true, transactionHash: "0xtxhash" });
      const mockAdminFetch = jest.fn().mockResolvedValue({ error: "DB error" });

      const {
        useUpdateMaxKeysPerAddress,
      } = require("@/hooks/unlock/useUpdateMaxKeysPerAddress");
      useUpdateMaxKeysPerAddress.mockReturnValue({
        updateMaxKeysPerAddress: mockUpdate,
        isLoading: false,
      });
      const { useAdminApi } = require("@/hooks/useAdminApi");
      useAdminApi.mockReturnValue({ adminFetch: mockAdminFetch });

      render(<MaxKeysSecurityButton {...defaultProps} />);
      await userEvent.click(
        screen.getByRole("button", { name: /secure lock/i }),
      );

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "Blockchain update succeeded but database update failed",
          { id: "secure-max-keys" },
        );
      });
    });

    it("handles generic errors", async () => {
      const mockUpdate = jest
        .fn()
        .mockRejectedValue(new Error("Unknown error"));
      const {
        useUpdateMaxKeysPerAddress,
      } = require("@/hooks/unlock/useUpdateMaxKeysPerAddress");
      useUpdateMaxKeysPerAddress.mockReturnValue({
        updateMaxKeysPerAddress: mockUpdate,
        isLoading: false,
      });

      render(<MaxKeysSecurityButton {...defaultProps} />);
      await userEvent.click(
        screen.getByRole("button", { name: /secure lock/i }),
      );

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Unknown error", {
          id: "secure-max-keys",
        });
      });
    });
  });

  describe("loading states", () => {
    it("disables button when isLoading is true", () => {
      const {
        useUpdateMaxKeysPerAddress,
      } = require("@/hooks/unlock/useUpdateMaxKeysPerAddress");
      useUpdateMaxKeysPerAddress.mockReturnValue({
        updateMaxKeysPerAddress: jest.fn(),
        isLoading: true,
      });

      render(<MaxKeysSecurityButton {...defaultProps} />);
      const button = screen.getByRole("button", { name: /securing/i });
      expect(button).toBeDisabled();
    });

    it("shows loading text when securing", () => {
      const {
        useUpdateMaxKeysPerAddress,
      } = require("@/hooks/unlock/useUpdateMaxKeysPerAddress");
      useUpdateMaxKeysPerAddress.mockReturnValue({
        updateMaxKeysPerAddress: jest.fn(),
        isLoading: true,
      });

      render(<MaxKeysSecurityButton {...defaultProps} />);
      expect(screen.getByText(/securing/i)).toBeInTheDocument();
    });
  });

  describe("toast notifications", () => {
    it("shows loading toast when starting", async () => {
      const mockUpdate = jest
        .fn()
        .mockResolvedValue({ success: true, transactionHash: "0xtxhash" });
      const mockAdminFetch = jest.fn().mockResolvedValue({ error: null });

      const {
        useUpdateMaxKeysPerAddress,
      } = require("@/hooks/unlock/useUpdateMaxKeysPerAddress");
      useUpdateMaxKeysPerAddress.mockReturnValue({
        updateMaxKeysPerAddress: mockUpdate,
        isLoading: false,
      });
      const { useAdminApi } = require("@/hooks/useAdminApi");
      useAdminApi.mockReturnValue({ adminFetch: mockAdminFetch });

      render(<MaxKeysSecurityButton {...defaultProps} />);

      await userEvent.click(
        screen.getByRole("button", { name: /secure lock/i }),
      );

      expect(toast.loading).toHaveBeenCalledWith(
        "Updating lock configuration...",
        { id: "secure-max-keys" },
      );
    });
  });
});
