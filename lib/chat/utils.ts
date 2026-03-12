import type {
  ChatConversation,
  ChatMessage,
  ChatMessageStatus,
  ChatRole,
} from "@/lib/chat/types";

export function createId() {
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function formatChatTime(ts: number) {
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function createMessage(
  role: ChatRole,
  content: string,
  options: {
    status?: ChatMessageStatus;
    error?: string | null;
  } = {},
): ChatMessage {
  return {
    id: createId(),
    role,
    content,
    ts: Date.now(),
    status: options.status ?? "complete",
    error: options.error ?? null,
  };
}

export function createAssistantMessage(
  content: string,
  options: {
    status?: ChatMessageStatus;
    error?: string | null;
  } = {},
): ChatMessage {
  return createMessage("assistant", content, options);
}

export function createUserMessage(content: string): ChatMessage {
  return createMessage("user", content);
}

export function isPersistableChatMessage(message: ChatMessage) {
  return message.status === "complete";
}

export function normalizeChatMessage(
  message: Omit<ChatMessage, "status" | "error"> &
    Partial<Pick<ChatMessage, "status" | "error">>,
): ChatMessage {
  return {
    ...message,
    status: message.status ?? "complete",
    error: message.error ?? null,
  };
}

export function normalizeChatMessages(
  messages: Array<
    Omit<ChatMessage, "status" | "error"> &
      Partial<Pick<ChatMessage, "status" | "error">>
  >,
) {
  return messages.map(normalizeChatMessage);
}

export function createConversationId() {
  return `chat_${createId()}`;
}

export function createConversation(
  source: ChatConversation["source"],
  messages: ChatMessage[],
): ChatConversation {
  const now = Date.now();

  return {
    id: createConversationId(),
    messages,
    createdAt: now,
    updatedAt: now,
    source,
  };
}
