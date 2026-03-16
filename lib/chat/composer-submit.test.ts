import { canSubmitChatComposer } from "@/lib/chat/composer-submit";

describe("canSubmitChatComposer", () => {
  it("rejects empty text when attachments are not ready", () => {
    expect(
      canSubmitChatComposer({
        text: "   ",
        attachments: [{ status: "error" }],
        disabled: false,
      }),
    ).toBe(false);
  });

  it("allows submission when a ready attachment exists without text", () => {
    expect(
      canSubmitChatComposer({
        text: "",
        attachments: [{ status: "ready" }],
        disabled: false,
      }),
    ).toBe(true);
  });

  it("rejects submission while any attachment is still uploading", () => {
    expect(
      canSubmitChatComposer({
        text: "hello",
        attachments: [{ status: "uploading" }],
        disabled: false,
      }),
    ).toBe(false);
  });
});
