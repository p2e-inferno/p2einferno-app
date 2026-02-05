import {
  sendMilestoneReviewNotification,
  sendQuestReviewNotification,
} from "@/lib/email/admin-notifications";
import * as dedup from "@/lib/email/dedup";
import * as helpers from "@/lib/email/helpers";
import { createAdminClient } from "@/lib/supabase/server";

// Mock dependencies
jest.mock("@/lib/supabase/server");
jest.mock("@/lib/email/mailgun");
jest.mock("@/lib/email/dedup");
jest.mock("@/lib/email/helpers");

describe("Admin Notification Service", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      ADMIN_REVIEW_EMAIL: "admin@test.com",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("sendMilestoneReviewNotification", () => {
    const testSubmissionId = "sub-123";
    const testUserId = "user-456";
    const testTaskId = "task-789";

    it("sends email successfully when context is found", async () => {
      const mockContext = {
        taskId: testTaskId,
        taskTitle: "Test Task",
        userName: "Test User",
        submissionType: "url",
        systemType: "milestone" as const,
      };

      (helpers.getMilestoneSubmissionContext as jest.Mock).mockResolvedValue(
        mockContext,
      );
      (dedup.sendEmailWithDedup as jest.Mock).mockResolvedValue({
        sent: true,
        skipped: false,
      });
      (createAdminClient as jest.Mock).mockReturnValue({});

      const result = await sendMilestoneReviewNotification(
        testSubmissionId,
        testUserId,
        testTaskId,
      );

      expect(result).toBe(true);
      expect(helpers.getMilestoneSubmissionContext).toHaveBeenCalledWith(
        {},
        testSubmissionId,
        testUserId,
      );
      expect(dedup.sendEmailWithDedup).toHaveBeenCalledWith(
        "admin_review_notification",
        testSubmissionId,
        "admin@test.com",
        `milestone_review_${testSubmissionId}`,
        expect.any(Function),
      );
    });

    it("uses default admin email when ADMIN_REVIEW_EMAIL not set", async () => {
      delete process.env.ADMIN_REVIEW_EMAIL;

      const mockContext = {
        taskId: testTaskId,
        taskTitle: "Test Task",
        userName: "Test User",
        submissionType: "url",
        systemType: "milestone" as const,
      };

      (helpers.getMilestoneSubmissionContext as jest.Mock).mockResolvedValue(
        mockContext,
      );
      (dedup.sendEmailWithDedup as jest.Mock).mockResolvedValue({
        sent: true,
        skipped: false,
      });
      (createAdminClient as jest.Mock).mockReturnValue({});

      await sendMilestoneReviewNotification(
        testSubmissionId,
        testUserId,
        testTaskId,
      );

      expect(dedup.sendEmailWithDedup).toHaveBeenCalledWith(
        "admin_review_notification",
        testSubmissionId,
        "info@p2einferno.com",
        expect.any(String),
        expect.any(Function),
      );
    });

    it("returns false when context is not found", async () => {
      (helpers.getMilestoneSubmissionContext as jest.Mock).mockResolvedValue(
        null,
      );
      (createAdminClient as jest.Mock).mockReturnValue({});

      const result = await sendMilestoneReviewNotification(
        testSubmissionId,
        testUserId,
        testTaskId,
      );

      expect(result).toBe(false);
      expect(dedup.sendEmailWithDedup).not.toHaveBeenCalled();
    });

    it("returns true when email is skipped (deduplication)", async () => {
      const mockContext = {
        taskId: testTaskId,
        taskTitle: "Test Task",
        userName: "Test User",
        submissionType: "url",
        systemType: "milestone" as const,
      };

      (helpers.getMilestoneSubmissionContext as jest.Mock).mockResolvedValue(
        mockContext,
      );
      (dedup.sendEmailWithDedup as jest.Mock).mockResolvedValue({
        sent: false,
        skipped: true,
      });
      (createAdminClient as jest.Mock).mockReturnValue({});

      const result = await sendMilestoneReviewNotification(
        testSubmissionId,
        testUserId,
        testTaskId,
      );

      expect(result).toBe(true);
    });

    it("returns false when email send fails", async () => {
      const mockContext = {
        taskId: testTaskId,
        taskTitle: "Test Task",
        userName: "Test User",
        submissionType: "url",
        systemType: "milestone" as const,
      };

      (helpers.getMilestoneSubmissionContext as jest.Mock).mockResolvedValue(
        mockContext,
      );
      (dedup.sendEmailWithDedup as jest.Mock).mockResolvedValue({
        sent: false,
        skipped: false,
        error: "Send failed",
      });
      (createAdminClient as jest.Mock).mockReturnValue({});

      const result = await sendMilestoneReviewNotification(
        testSubmissionId,
        testUserId,
        testTaskId,
      );

      expect(result).toBe(false);
    });

    it("handles exceptions gracefully and returns false", async () => {
      (createAdminClient as jest.Mock).mockImplementation(() => {
        throw new Error("Database connection failed");
      });

      const result = await sendMilestoneReviewNotification(
        testSubmissionId,
        testUserId,
        testTaskId,
      );

      expect(result).toBe(false);
    });

    it("uses correct dedup key format", async () => {
      const mockContext = {
        taskId: testTaskId,
        taskTitle: "Test Task",
        userName: "Test User",
        submissionType: "url",
        systemType: "milestone" as const,
      };

      (helpers.getMilestoneSubmissionContext as jest.Mock).mockResolvedValue(
        mockContext,
      );
      (dedup.sendEmailWithDedup as jest.Mock).mockResolvedValue({
        sent: true,
        skipped: false,
      });
      (createAdminClient as jest.Mock).mockReturnValue({});

      await sendMilestoneReviewNotification(
        testSubmissionId,
        testUserId,
        testTaskId,
      );

      expect(dedup.sendEmailWithDedup).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        `milestone_review_${testSubmissionId}`,
        expect.any(Function),
      );
    });
  });

  describe("sendQuestReviewNotification", () => {
    const testTaskId = "task-123";
    const testUserId = "user-456";
    const testQuestId = "quest-789";
    const testAttemptKey = "2026-02-04T00:00:00.000Z";

    it("sends email successfully when context is found", async () => {
      const mockContext = {
        submissionId: "completion-123",
        submissionAttemptKey: testAttemptKey,
        taskId: testTaskId,
        taskTitle: "Quest Task",
        userName: "Quest User",
        submissionType: "deploy_lock",
        systemType: "quest" as const,
      };

      (helpers.getQuestSubmissionContext as jest.Mock).mockResolvedValue(
        mockContext,
      );
      (dedup.sendEmailWithDedup as jest.Mock).mockResolvedValue({
        sent: true,
        skipped: false,
      });
      (createAdminClient as jest.Mock).mockReturnValue({});

      const result = await sendQuestReviewNotification(
        testTaskId,
        testUserId,
        testQuestId,
      );

      expect(result).toBe(true);
      expect(helpers.getQuestSubmissionContext).toHaveBeenCalledWith(
        {},
        testTaskId,
        testUserId,
      );
      expect(dedup.sendEmailWithDedup).toHaveBeenCalledWith(
        "admin_review_notification",
        testTaskId,
        "admin@test.com",
        `quest_review_${testTaskId}_${testUserId}_${testAttemptKey}`,
        expect.any(Function),
      );
    });

    it("returns false when context is not found", async () => {
      (helpers.getQuestSubmissionContext as jest.Mock).mockResolvedValue(null);
      (createAdminClient as jest.Mock).mockReturnValue({});

      const result = await sendQuestReviewNotification(
        testTaskId,
        testUserId,
        testQuestId,
      );

      expect(result).toBe(false);
      expect(dedup.sendEmailWithDedup).not.toHaveBeenCalled();
    });

    it("uses correct dedup key format", async () => {
      const mockContext = {
        submissionId: "completion-456",
        submissionAttemptKey: testAttemptKey,
        taskId: testTaskId,
        taskTitle: "Quest Task",
        userName: "Quest User",
        submissionType: "submit_url",
        systemType: "quest" as const,
      };

      (helpers.getQuestSubmissionContext as jest.Mock).mockResolvedValue(
        mockContext,
      );
      (dedup.sendEmailWithDedup as jest.Mock).mockResolvedValue({
        sent: true,
        skipped: false,
      });
      (createAdminClient as jest.Mock).mockReturnValue({});

      await sendQuestReviewNotification(testTaskId, testUserId, testQuestId);

      expect(dedup.sendEmailWithDedup).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        `quest_review_${testTaskId}_${testUserId}_${testAttemptKey}`,
        expect.any(Function),
      );
    });

    it("handles exceptions gracefully and returns false", async () => {
      (createAdminClient as jest.Mock).mockImplementation(() => {
        throw new Error("Database connection failed");
      });

      const result = await sendQuestReviewNotification(
        testTaskId,
        testUserId,
        testQuestId,
      );

      expect(result).toBe(false);
    });
  });
});
