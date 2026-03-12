import type { ChatConversation, ChatMessage, ChatRole } from "@/lib/chat/types";

export function createId() {
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function formatChatTime(ts: number) {
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function createMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: createId(),
    role,
    content,
    ts: Date.now(),
  };
}

export function createAssistantMessage(content: string): ChatMessage {
  return createMessage("assistant", content);
}

export function createUserMessage(content: string): ChatMessage {
  return createMessage("user", content);
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
