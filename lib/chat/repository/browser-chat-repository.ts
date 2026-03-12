import { CHAT_STORAGE_KEYS, CHAT_WELCOME_MESSAGE } from "@/lib/chat/constants";
import type { ChatRepository } from "@/lib/chat/repository/chat-repository";
import type {
  ChatConversation,
  ChatMessage,
  ChatWidgetSession,
  RestoreConversationResult,
} from "@/lib/chat/types";
import { createConversation, normalizeChatMessages } from "@/lib/chat/utils";

interface BrowserChatRepositoryOptions {
  authenticated: boolean;
  privyUserId?: string | null;
}

function getStorageKey(options: BrowserChatRepositoryOptions) {
  if (!options.authenticated) {
    return CHAT_STORAGE_KEYS.anonymousConversation;
  }

  return `${CHAT_STORAGE_KEYS.authenticatedConversation}:${options.privyUserId ?? "unknown"}`;
}

function getWidgetKey(options: BrowserChatRepositoryOptions) {
  if (!options.authenticated) {
    return CHAT_STORAGE_KEYS.anonymousWidget;
  }

  return `${CHAT_STORAGE_KEYS.authenticatedWidget}:${options.privyUserId ?? "unknown"}`;
}

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage;
}

export class BrowserChatRepository implements ChatRepository {
  readonly name = "browser";

  readonly isAvailable = true;

  constructor(private readonly options: BrowserChatRepositoryOptions) {}

  private clearLegacyAuthenticatedStorage(storage: Storage | null) {
    if (!storage || !this.options.authenticated) {
      return;
    }

    storage.removeItem(CHAT_STORAGE_KEYS.authenticatedConversation);
    storage.removeItem(CHAT_STORAGE_KEYS.authenticatedWidget);
  }

  async restoreActiveConversation(): Promise<RestoreConversationResult> {
    const storage = getStorage();
    if (!storage) {
      return { conversation: null, widget: null };
    }

    this.clearLegacyAuthenticatedStorage(storage);

    const rawConversation = storage.getItem(getStorageKey(this.options));
    const rawWidget = storage.getItem(getWidgetKey(this.options));

    const conversation = rawConversation
      ? ({
          ...(JSON.parse(rawConversation) as ChatConversation),
          messages: normalizeChatMessages(
            (JSON.parse(rawConversation) as ChatConversation).messages || [],
          ),
        } as ChatConversation)
      : null;
    const widget = rawWidget
      ? (JSON.parse(rawWidget) as ChatWidgetSession)
      : null;

    return {
      conversation,
      widget,
    };
  }

  async createConversation(
    conversation: ChatConversation,
  ): Promise<ChatConversation> {
    const storage = getStorage();
    if (!storage) {
      return conversation;
    }

    this.clearLegacyAuthenticatedStorage(storage);

    storage.setItem(getStorageKey(this.options), JSON.stringify(conversation));

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

    this.clearLegacyAuthenticatedStorage(storage);

    const rawConversation = storage.getItem(getStorageKey(this.options));
    const existing = rawConversation
      ? ({
          ...(JSON.parse(rawConversation) as ChatConversation),
          messages: normalizeChatMessages(
            (JSON.parse(rawConversation) as ChatConversation).messages || [],
          ),
        } as ChatConversation)
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
      getStorageKey(this.options),
      JSON.stringify(nextConversation),
    );

    return nextConversation;
  }

  async clearConversation(_conversationId: string | null): Promise<void> {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    this.clearLegacyAuthenticatedStorage(storage);
    storage.removeItem(getStorageKey(this.options));
  }

  async saveWidgetSession(session: ChatWidgetSession): Promise<void> {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    this.clearLegacyAuthenticatedStorage(storage);
    storage.setItem(getWidgetKey(this.options), JSON.stringify(session));
  }
}
