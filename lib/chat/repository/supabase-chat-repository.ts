import type { ChatRepository } from "@/lib/chat/repository/chat-repository";
import type {
  ChatConversation,
  ChatMessage,
  ChatWidgetSession,
  RestoreConversationResult,
} from "@/lib/chat/types";
import { ensureJsonResponse } from "@/lib/chat/repository/http";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("chat:supabase-repository");

interface SupabaseChatRepositoryOptions {
  privyUserId: string | null;
  accessToken?: string | null;
}

export class SupabaseChatRepository implements ChatRepository {
  readonly name = "supabase";

  readonly isAvailable: boolean;

  constructor(private readonly options: SupabaseChatRepositoryOptions) {
    this.isAvailable = Boolean(options.privyUserId);
  }

  async restoreActiveConversation(): Promise<RestoreConversationResult> {
    if (!this.isAvailable) {
      return { conversation: null, widget: null };
    }

    const response = await fetch("/api/chat/session", {
      method: "GET",
      headers: this.getHeaders(),
      credentials: "include",
    });

    return ensureJsonResponse<RestoreConversationResult>(response);
  }

  async createConversation(conversation: ChatConversation): Promise<ChatConversation> {
    const response = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: this.getHeaders(),
      credentials: "include",
      body: JSON.stringify({ conversation }),
    });

    const payload = await ensureJsonResponse<{ conversation: ChatConversation }>(response);
    return payload.conversation;
  }

  async appendMessages(
    conversationId: string,
    messages: ChatMessage[],
  ): Promise<ChatConversation | null> {
    const response = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: this.getHeaders(),
      credentials: "include",
      body: JSON.stringify({ messages }),
    });

    const payload = await ensureJsonResponse<{ conversation: ChatConversation | null }>(response);
    return payload.conversation;
  }

  async clearConversation(conversationId: string | null): Promise<void> {
    const suffix = conversationId
      ? `?conversationId=${encodeURIComponent(conversationId)}`
      : "";
    const response = await fetch(`/api/chat/conversations/current${suffix}`, {
      method: "DELETE",
      headers: this.getHeaders(),
      credentials: "include",
    });

    await ensureJsonResponse<{ ok: true }>(response);
  }

  async saveWidgetSession(session: ChatWidgetSession): Promise<void> {
    const response = await fetch("/api/chat/session", {
      method: "PUT",
      headers: this.getHeaders(),
      credentials: "include",
      body: JSON.stringify({ widget: session }),
    });

    await ensureJsonResponse<{ ok: true }>(response);
    log.debug("Supabase chat widget session saved", {
      privyUserId: this.options.privyUserId,
      isOpen: session.isOpen,
    });
  }

  private getHeaders() {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (this.options.accessToken) {
      headers.Authorization = `Bearer ${this.options.accessToken}`;
    }

    return headers;
  }
}
