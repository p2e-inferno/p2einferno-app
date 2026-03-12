import type {
  ChatConversation,
  ChatMessage,
  ChatWidgetSession,
  RestoreConversationResult,
} from "@/lib/chat/types";

export interface ChatRepository {
  readonly name: string;
  readonly isAvailable: boolean;
  restoreActiveConversation(): Promise<RestoreConversationResult>;
  createConversation(conversation: ChatConversation): Promise<ChatConversation>;
  appendMessages(
    conversationId: string,
    messages: ChatMessage[],
  ): Promise<ChatConversation | null>;
  clearConversation(conversationId: string | null): Promise<void>;
  saveWidgetSession(session: ChatWidgetSession): Promise<void>;
}
