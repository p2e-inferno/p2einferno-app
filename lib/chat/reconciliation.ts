import type {
  ChatConversation,
  ChatMessage,
  ChatReconciliationPlan,
  RestoreConversationResult,
} from "@/lib/chat/types";

function getMissingMessages(
  durableConversation: ChatConversation,
  fallbackConversation: ChatConversation,
): ChatMessage[] {
  const durableMessageIds = new Set(durableConversation.messages.map((message) => message.id));

  return fallbackConversation.messages.filter((message) => !durableMessageIds.has(message.id));
}

export function resolveChatReconciliationPlan(params: {
  durable: RestoreConversationResult;
  fallback: RestoreConversationResult;
  authenticated: boolean;
}): ChatReconciliationPlan {
  const { durable, fallback, authenticated } = params;

  if (!authenticated) {
    return {
      action: "fallback_only",
      resolved: fallback,
      pendingMessages: [],
    };
  }

  if (!durable.conversation && !durable.widget && (fallback.conversation || fallback.widget)) {
    return {
      action: "promote_fallback",
      resolved: fallback,
      pendingMessages: fallback.conversation?.messages || [],
    };
  }

  if (!durable.conversation) {
    return {
      action: "none",
      resolved: durable,
      pendingMessages: [],
    };
  }

  if (!fallback.conversation) {
    return {
      action: "prefer_durable",
      resolved: {
        conversation: durable.conversation,
        widget: durable.widget ?? fallback.widget,
      },
      pendingMessages: [],
    };
  }

  if (fallback.conversation.id !== durable.conversation.id) {
    return {
      action: "prefer_durable",
      resolved: {
        conversation: durable.conversation,
        widget: durable.widget ?? fallback.widget,
      },
      pendingMessages: [],
    };
  }

  const pendingMessages = getMissingMessages(durable.conversation, fallback.conversation);
  if (pendingMessages.length === 0) {
    return {
      action: "prefer_durable",
      resolved: {
        conversation: durable.conversation,
        widget: durable.widget ?? fallback.widget,
      },
      pendingMessages: [],
    };
  }

  return {
    action: "merge_fallback_messages",
    resolved: {
      conversation: {
        ...durable.conversation,
        messages: [...durable.conversation.messages, ...pendingMessages].sort(
          (left, right) => left.ts - right.ts,
        ),
      },
      widget: durable.widget ?? fallback.widget,
    },
    pendingMessages,
  };
}
