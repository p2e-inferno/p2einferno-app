import type { SuggestedPrompt, ChatMessage } from "@/lib/chat/types";
import { createAssistantMessage } from "@/lib/chat/utils";

export const CHAT_STORAGE_KEYS = {
  anonymousConversation: "chat-widget:anonymous-conversation",
  authenticatedConversation: "chat-widget:authenticated-conversation",
  anonymousWidget: "chat-widget:anonymous-widget",
  authenticatedWidget: "chat-widget:authenticated-widget",
} as const;

export const CHAT_TEASER_SHOW_DELAY_MS = 600;
export const CHAT_TEASER_HIDE_DELAY_MS = 15000;
export const CHAT_PANEL_MOBILE_CLASS =
  "w-[calc(100vw-1.5rem)] max-w-[420px] h-[460px] max-h-[calc(100vh-8rem)]";

export const CHAT_SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  {
    label: "What do I do here?",
    prompt: "I just landed here. What should I do first?",
  },
  { label: "How to earn", prompt: "How do I start earning rewards on this app?" },
  { label: "Connect wallet", prompt: "Help me connect my wallet step by step." },
  { label: "Verify identity", prompt: "What is verification and why do I need it?" },
];

export const CHAT_WELCOME_MESSAGE: ChatMessage = createAssistantMessage(
  "Hey 👋 I’m your in-app guide. Ask me anything — or tap a quick prompt below to get started.",
);
