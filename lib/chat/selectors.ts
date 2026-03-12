import type { ChatMessage, ChatWidgetState } from "@/lib/chat/types";

export function selectChatCanSend(state: ChatWidgetState) {
  return state.status !== "sending" && state.draft.trim().length > 0;
}

export function selectChatHasOnlyWelcomeMessage(messages: ChatMessage[]) {
  return messages.length <= 1;
}

export function selectChatHasActiveStreamingAssistantMessage(
  messages: ChatMessage[],
) {
  return messages.some(
    (message) => message.role === "assistant" && message.status === "streaming",
  );
}

export function selectChatShouldShowTypingIndicator(state: ChatWidgetState) {
  if (state.status === "hydrating") {
    return true;
  }

  if (state.status !== "sending") {
    return false;
  }

  return !selectChatHasActiveStreamingAssistantMessage(state.messages);
}

export function selectChatIsBusy(state: ChatWidgetState) {
  return state.status === "sending" || state.status === "hydrating";
}
