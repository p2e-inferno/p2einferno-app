import {
  getTaskConfigBoolean,
  normalizeQuestTaskConfig,
} from "@/lib/quests/task-config";

describe("quest task config helpers", () => {
  test("normalizes AI config fields and preserves valid values", () => {
    const normalized = normalizeQuestTaskConfig({
      ai_verification_prompt: "  Show the completion badge  ",
      ai_prompt_required: "true",
      ai_confidence_threshold: "1.2",
      ai_model: "  google/gemini-2.0-flash-001  ",
      wallet_match_mode: "any_linked",
      custom_key: "kept",
    });

    expect(normalized).toEqual({
      ai_verification_prompt: "Show the completion badge",
      ai_prompt_required: true,
      ai_confidence_threshold: 1,
      ai_model: "google/gemini-2.0-flash-001",
      wallet_match_mode: "any_linked",
      custom_key: "kept",
    });
  });

  test("drops invalid AI config values", () => {
    const normalized = normalizeQuestTaskConfig({
      ai_verification_prompt: "   ",
      ai_prompt_required: "maybe",
      ai_confidence_threshold: "nope",
      ai_model: 123,
      wallet_match_mode: "sideways",
      custom_key: "kept",
    });

    expect(normalized).toEqual({
      custom_key: "kept",
    });
  });

  test("boolean helper remains strict at read time", () => {
    expect(
      getTaskConfigBoolean({ ai_prompt_required: true }, "ai_prompt_required"),
    ).toBe(true);
    expect(
      getTaskConfigBoolean(
        { ai_prompt_required: "true" as unknown as boolean },
        "ai_prompt_required",
      ),
    ).toBe(false);
  });
});
