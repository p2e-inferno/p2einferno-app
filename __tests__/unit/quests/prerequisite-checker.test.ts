/**
 * Tests for quest prerequisite checking logic
 */

import { checkQuestPrerequisites } from "@/lib/quests/prerequisite-checker";

// Mock the checkKeyOwnership function
jest.mock("@/lib/unlock/lockUtils", () => ({
  checkKeyOwnership: jest.fn(),
}));

import { checkKeyOwnership } from "@/lib/unlock/lockUtils";

describe("checkQuestPrerequisites", () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
    } as any;
  });

  describe("No prerequisites", () => {
    it("should allow proceeding when no prerequisites are configured", async () => {
      const result = await checkQuestPrerequisites(
        mockSupabase,
        "user123",
        "0x1234567890123456789012345678901234567890",
        {
          prerequisite_quest_id: null,
          prerequisite_quest_lock_address: null,
          requires_prerequisite_key: false,
        },
      );

      expect(result).toEqual({
        canProceed: true,
        prerequisiteState: "none",
      });
    });
  });

  describe("Quest completion prerequisite", () => {
    it("should allow proceeding when prerequisite quest is completed", async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: { is_completed: true },
        error: null,
      });

      const result = await checkQuestPrerequisites(
        mockSupabase,
        "user123",
        "0x1234567890123456789012345678901234567890",
        {
          prerequisite_quest_id: "prereq-quest-id",
          prerequisite_quest_lock_address: null,
          requires_prerequisite_key: false,
        },
      );

      expect(result).toEqual({
        canProceed: true,
        prerequisiteState: "ok",
      });
    });

    it("should block when prerequisite quest is not completed", async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: { is_completed: false },
        error: null,
      });

      const result = await checkQuestPrerequisites(
        mockSupabase,
        "user123",
        "0x1234567890123456789012345678901234567890",
        {
          prerequisite_quest_id: "prereq-quest-id",
          prerequisite_quest_lock_address: null,
          requires_prerequisite_key: false,
        },
      );

      expect(result).toEqual({
        canProceed: false,
        reason: "You must complete the prerequisite quest first",
        prerequisiteState: "missing_completion",
      });
    });

    it("should block when prerequisite quest progress not found", async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await checkQuestPrerequisites(
        mockSupabase,
        "user123",
        "0x1234567890123456789012345678901234567890",
        {
          prerequisite_quest_id: "prereq-quest-id",
          prerequisite_quest_lock_address: null,
          requires_prerequisite_key: false,
        },
      );

      expect(result).toEqual({
        canProceed: false,
        reason: "You must complete the prerequisite quest first",
        prerequisiteState: "missing_completion",
      });
    });
  });

  describe("Key ownership prerequisite", () => {
    it("should allow proceeding when user has valid key", async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: { is_completed: true },
        error: null,
      });

      (checkKeyOwnership as jest.Mock).mockResolvedValue(true);

      const result = await checkQuestPrerequisites(
        mockSupabase,
        "user123",
        "0x1234567890123456789012345678901234567890",
        {
          prerequisite_quest_id: "prereq-quest-id",
          prerequisite_quest_lock_address:
            "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
          requires_prerequisite_key: true,
        },
      );

      expect(checkKeyOwnership).toHaveBeenCalledWith(
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        "0x1234567890123456789012345678901234567890",
      );

      expect(result).toEqual({
        canProceed: true,
        prerequisiteState: "ok",
      });
    });

    it("should block when user does not have valid key", async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: { is_completed: true },
        error: null,
      });

      (checkKeyOwnership as jest.Mock).mockResolvedValue(false);

      const result = await checkQuestPrerequisites(
        mockSupabase,
        "user123",
        "0x1234567890123456789012345678901234567890",
        {
          prerequisite_quest_id: "prereq-quest-id",
          prerequisite_quest_lock_address:
            "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
          requires_prerequisite_key: true,
        },
      );

      expect(result).toEqual({
        canProceed: false,
        reason:
          "You must hold a valid key for the prerequisite quest to proceed",
        prerequisiteState: "missing_key",
      });
    });

    it("should block when wallet address is missing", async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: { is_completed: true },
        error: null,
      });

      const result = await checkQuestPrerequisites(
        mockSupabase,
        "user123",
        null, // No wallet address
        {
          prerequisite_quest_id: "prereq-quest-id",
          prerequisite_quest_lock_address:
            "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
          requires_prerequisite_key: true,
        },
      );

      expect(result).toEqual({
        canProceed: false,
        reason: "Wallet address required to verify key ownership",
        prerequisiteState: "missing_key",
      });
    });
  });

  describe("Error handling", () => {
    it("should handle database errors gracefully", async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: "Database error" },
      });

      const result = await checkQuestPrerequisites(
        mockSupabase,
        "user123",
        "0x1234567890123456789012345678901234567890",
        {
          prerequisite_quest_id: "prereq-quest-id",
          prerequisite_quest_lock_address: null,
          requires_prerequisite_key: false,
        },
      );

      expect(result).toEqual({
        canProceed: false,
        reason: "Failed to verify prerequisite quest completion",
        prerequisiteState: "missing_completion",
      });
    });

    it("should handle key ownership check errors", async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: { is_completed: true },
        error: null,
      });

      (checkKeyOwnership as jest.Mock).mockRejectedValue(
        new Error("RPC error"),
      );

      const result = await checkQuestPrerequisites(
        mockSupabase,
        "user123",
        "0x1234567890123456789012345678901234567890",
        {
          prerequisite_quest_id: "prereq-quest-id",
          prerequisite_quest_lock_address:
            "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
          requires_prerequisite_key: true,
        },
      );

      expect(result).toEqual({
        canProceed: false,
        reason: "Failed to verify key ownership",
        prerequisiteState: "missing_key",
      });
    });
  });
});
