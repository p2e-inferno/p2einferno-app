import { resolveChatReconciliationPlan } from "@/lib/chat/reconciliation";
import type { ChatConversation, RestoreConversationResult } from "@/lib/chat/types";

function makeConversation(
  id: string,
  messageIds: string[],
): ChatConversation {
  return {
    id,
    source: "authenticated",
    createdAt: Date.now(),
    updatedAt: Date.now(),
      messages: messageIds.map((messageId, index) => ({
        id: messageId,
        role: index % 2 === 0 ? "assistant" : "user",
        content: messageId,
        ts: index + 1,
        status: "complete",
        error: null,
      })),
  };
}

describe("resolveChatReconciliationPlan", () => {
  it("promotes fallback state when durable state is empty", () => {
    const fallback: RestoreConversationResult = {
      conversation: makeConversation("chat_1", ["m1", "m2"]),
      widget: {
        isOpen: true,
        isPeekVisible: false,
        isPeekDismissed: true,
        draft: "",
        activeConversationId: "chat_1",
      },
    };

    const plan = resolveChatReconciliationPlan({
      durable: { conversation: null, widget: null },
      fallback,
      authenticated: true,
    });

    expect(plan.action).toBe("promote_fallback");
    expect(plan.pendingMessages).toHaveLength(2);
  });

  it("merges fallback-only messages when durable and fallback share the same conversation id", () => {
    const plan = resolveChatReconciliationPlan({
      durable: {
        conversation: makeConversation("chat_1", ["m1"]),
        widget: null,
      },
      fallback: {
        conversation: makeConversation("chat_1", ["m1", "m2"]),
        widget: null,
      },
      authenticated: true,
    });

    expect(plan.action).toBe("merge_fallback_messages");
    expect(plan.pendingMessages.map((message) => message.id)).toEqual(["m2"]);
  });

  it("prefers durable state when fallback diverges to another conversation id", () => {
    const plan = resolveChatReconciliationPlan({
      durable: {
        conversation: makeConversation("chat_durable", ["m1"]),
        widget: null,
      },
      fallback: {
        conversation: makeConversation("chat_fallback", ["m1", "m2"]),
        widget: null,
      },
      authenticated: true,
    });

    expect(plan.action).toBe("prefer_durable");
    expect(plan.pendingMessages).toEqual([]);
    expect(plan.resolved.conversation?.id).toBe("chat_durable");
  });
});
