import type { ChatMessage, ChatWidgetState } from "@/lib/chat/types";

export function selectChatCanSend(state: ChatWidgetState) {
  return state.status !== "sending" && state.draft.trim().length > 0;
}

export function selectChatHasOnlyWelcomeMessage(messages: ChatMessage[]) {
  return messages.length <= 1;
}
