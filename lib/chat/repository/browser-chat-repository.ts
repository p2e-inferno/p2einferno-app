import {
  CHAT_STORAGE_KEYS,
  CHAT_WELCOME_MESSAGE,
} from "@/lib/chat/constants";
import type { ChatRepository } from "@/lib/chat/repository/chat-repository";
import type {
  ChatConversation,
  ChatMessage,
  ChatWidgetSession,
  RestoreConversationResult,
} from "@/lib/chat/types";
import { createConversation } from "@/lib/chat/utils";

interface BrowserChatRepositoryOptions {
  authenticated: boolean;
}

function getStorageKey(authenticated: boolean) {
  return authenticated
    ? CHAT_STORAGE_KEYS.authenticatedConversation
    : CHAT_STORAGE_KEYS.anonymousConversation;
}

function getWidgetKey(authenticated: boolean) {
  return authenticated
    ? CHAT_STORAGE_KEYS.authenticatedWidget
    : CHAT_STORAGE_KEYS.anonymousWidget;
}

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export class BrowserChatRepository implements ChatRepository {
  readonly name = "browser";

  readonly isAvailable = true;

  constructor(private readonly options: BrowserChatRepositoryOptions) {}

  async restoreActiveConversation(): Promise<RestoreConversationResult> {
    const storage = getStorage();
    if (!storage) {
      return { conversation: null, widget: null };
    }

    const rawConversation = storage.getItem(getStorageKey(this.options.authenticated));
    const rawWidget = storage.getItem(getWidgetKey(this.options.authenticated));

    const conversation = rawConversation
      ? (JSON.parse(rawConversation) as ChatConversation)
      : null;
    const widget = rawWidget ? (JSON.parse(rawWidget) as ChatWidgetSession) : null;

    return {
      conversation,
      widget,
    };
  }

  async createConversation(conversation: ChatConversation): Promise<ChatConversation> {
    const storage = getStorage();
    if (!storage) {
      return conversation;
    }

    storage.setItem(
      getStorageKey(this.options.authenticated),
      JSON.stringify(conversation),
    );

    return conversation;
  }

  async appendMessages(
    conversationId: string,
    messages: ChatMessage[],
  ): Promise<ChatConversation | null> {
    const storage = getStorage();
    if (!storage) {
      return null;
    }

    const rawConversation = storage.getItem(getStorageKey(this.options.authenticated));
    const existing = rawConversation
      ? (JSON.parse(rawConversation) as ChatConversation)
      : createConversation(
          this.options.authenticated ? "authenticated" : "anonymous",
          [CHAT_WELCOME_MESSAGE],
        );

    const nextConversation: ChatConversation = {
      ...existing,
      id: conversationId || existing.id,
      messages: [...existing.messages, ...messages],
      updatedAt: Date.now(),
    };

    storage.setItem(
      getStorageKey(this.options.authenticated),
      JSON.stringify(nextConversation),
    );

    return nextConversation;
  }

  async clearConversation(_conversationId: string | null): Promise<void> {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    storage.removeItem(getStorageKey(this.options.authenticated));
  }

  async saveWidgetSession(session: ChatWidgetSession): Promise<void> {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    storage.setItem(getWidgetKey(this.options.authenticated), JSON.stringify(session));
  }
}
