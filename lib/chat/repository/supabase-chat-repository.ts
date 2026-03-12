import type { ChatRepository } from "@/lib/chat/repository/chat-repository";
import type {
  ChatConversation,
  ChatMessage,
  ChatWidgetSession,
  RestoreConversationResult,
} from "@/lib/chat/types";
import { createClient } from "@/lib/supabase/client";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("chat:supabase-repository");

interface SupabaseChatRepositoryOptions {
  privyUserId: string | null;
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

    log.debug("Supabase chat restore requested but durable chat persistence is not wired yet", {
      privyUserId: this.options.privyUserId,
    });

    return { conversation: null, widget: null };
  }

  async createConversation(conversation: ChatConversation): Promise<ChatConversation> {
    this.getClient();
    log.debug("Supabase chat create requested", {
      privyUserId: this.options.privyUserId,
      conversationId: conversation.id,
    });
    return conversation;
  }

  async appendMessages(
    _conversationId: string,
    _messages: ChatMessage[],
  ): Promise<ChatConversation | null> {
    this.getClient();
    log.debug("Supabase chat append requested", {
      privyUserId: this.options.privyUserId,
      messageCount: _messages.length,
    });
    return null;
  }

  async clearConversation(conversationId: string | null): Promise<void> {
    this.getClient();
    log.debug("Supabase chat clear requested", {
      privyUserId: this.options.privyUserId,
      conversationId,
    });
  }

  async saveWidgetSession(session: ChatWidgetSession): Promise<void> {
    this.getClient();
    log.debug("Supabase chat widget session save requested", {
      privyUserId: this.options.privyUserId,
      isOpen: session.isOpen,
    });
  }

  private getClient() {
    if (!this.isAvailable) {
      return null;
    }

    try {
      return createClient();
    } catch (error) {
      log.warn("Unable to initialize supabase client for chat persistence", {
        error,
      });
      return null;
    }
  }
}
