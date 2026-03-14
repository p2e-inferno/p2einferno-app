import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import type {
  ChatConversation,
  ChatMessage,
  ChatWidgetSession,
  RestoreConversationResult,
} from "@/lib/chat/types";

interface ChatConversationRow {
  id: string;
  privy_user_id: string;
  source: ChatConversation["source"];
  created_at: string;
  updated_at: string;
  cleared_at: string | null;
}

interface ChatMessageRow {
  id: string;
  conversation_id: string;
  role: ChatMessage["role"];
  content: string;
  sent_at: string;
  created_at: string;
}

interface ChatWidgetSessionRow {
  privy_user_id: string;
  active_conversation_id: string | null;
  is_open: boolean;
  is_peek_visible: boolean;
  is_peek_dismissed: boolean;
  draft: string;
  updated_at: string;
}

function mapMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    ts: Date.parse(row.sent_at || row.created_at),
    status: "complete",
    error: null,
  };
}

function mapConversation(
  row: ChatConversationRow,
  messages: ChatMessage[],
): ChatConversation {
  return {
    id: row.id,
    source: row.source,
    messages,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

function mapWidgetSession(row: ChatWidgetSessionRow): ChatWidgetSession {
  return {
    isOpen: row.is_open,
    isPeekVisible: row.is_peek_visible,
    isPeekDismissed: row.is_peek_dismissed,
    draft: row.draft,
    activeConversationId: row.active_conversation_id,
  };
}

export class ChatService {
  constructor(
    private readonly supabase: SupabaseClient = createAdminClient(),
  ) {}

  async restoreActiveConversation(
    privyUserId: string,
  ): Promise<RestoreConversationResult> {
    const widget = await this.getWidgetSession(privyUserId);
    const widgetConversationId = widget?.activeConversationId;

    if (widgetConversationId) {
      const activeConversation = await this.getConversation(
        privyUserId,
        widgetConversationId,
      );

      if (activeConversation) {
        return { conversation: activeConversation, widget };
      }
    }

    const latestConversationId = await this.getLatestConversationId(privyUserId);
    if (!latestConversationId) {
      return { conversation: null, widget };
    }

    const conversation = await this.getConversation(
      privyUserId,
      latestConversationId,
    );

    if (!conversation) {
      return { conversation: null, widget };
    }

    if (widget && widget.activeConversationId !== latestConversationId) {
      const normalizedWidget = {
        ...widget,
        activeConversationId: latestConversationId,
      };
      await this.saveWidgetSession(privyUserId, normalizedWidget);
      return { conversation, widget: normalizedWidget };
    }

    return { conversation, widget };
  }

  async createConversation(
    privyUserId: string,
    conversation: ChatConversation,
  ): Promise<ChatConversation> {
    const now = new Date().toISOString();
    const source: ChatConversation["source"] = "authenticated";
    const existingConversation = await this.getConversationRowById(
      conversation.id,
    );

    if (!existingConversation) {
      const { error } = await this.supabase.from("chat_conversations").insert({
        id: conversation.id,
        privy_user_id: privyUserId,
        source,
        created_at: now,
        updated_at: now,
        cleared_at: null,
      });

      if (error) {
        throw error;
      }
    } else {
      if (existingConversation.privy_user_id !== privyUserId) {
        throw new Error("Conversation already belongs to another user");
      }

      const { error } = await this.supabase
        .from("chat_conversations")
        .update({
          source,
          updated_at: now,
          cleared_at: null,
        })
        .eq("id", conversation.id)
        .eq("privy_user_id", privyUserId);

      if (error) {
        throw error;
      }
    }

    return {
      ...conversation,
      source,
      createdAt: Date.parse(now),
      updatedAt: Date.parse(now),
    };
  }

  async appendMessages(
    privyUserId: string,
    conversationId: string,
    messages: ChatMessage[],
  ): Promise<ChatConversation | null> {
    const ownedConversation = await this.getOwnedConversationRow(
      privyUserId,
      conversationId,
    );
    if (!ownedConversation) {
      throw new Error("Conversation not found");
    }

    if (messages.length === 0) {
      return this.getConversation(privyUserId, conversationId);
    }

    for (const message of messages) {
      const existingMessage = await this.getMessageRowById(message.id);

      if (!existingMessage) {
        const { error: insertError } = await this.supabase
          .from("chat_messages")
          .insert({
            id: message.id,
            conversation_id: conversationId,
            role: message.role,
            content: message.content,
            sent_at: new Date(message.ts).toISOString(),
          });

        if (insertError) {
          throw insertError;
        }

        continue;
      }

      if (existingMessage.conversation_id !== conversationId) {
        throw new Error("Message already belongs to another conversation");
      }

      const { error: updateError } = await this.supabase
        .from("chat_messages")
        .update({
          role: message.role,
          content: message.content,
          sent_at: new Date(message.ts).toISOString(),
        })
        .eq("id", message.id)
        .eq("conversation_id", conversationId);

      if (updateError) {
        throw updateError;
      }
    }

    const { error: updateError } = await this.supabase
      .from("chat_conversations")
      .update({
        updated_at: new Date().toISOString(),
        cleared_at: null,
      })
      .eq("id", conversationId)
      .eq("privy_user_id", privyUserId);

    if (updateError) {
      throw updateError;
    }

    return this.getConversation(privyUserId, conversationId);
  }

  async removeMessage(
    privyUserId: string,
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    const ownedConversation = await this.getOwnedConversationRow(
      privyUserId,
      conversationId,
    );
    if (!ownedConversation) {
      throw new Error("Conversation not found");
    }

    const { error: deleteError } = await this.supabase
      .from("chat_messages")
      .delete()
      .eq("id", messageId)
      .eq("conversation_id", conversationId);

    if (deleteError) {
      throw deleteError;
    }

    const { error: updateError } = await this.supabase
      .from("chat_conversations")
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId)
      .eq("privy_user_id", privyUserId);

    if (updateError) {
      throw updateError;
    }
  }

  async clearConversation(
    privyUserId: string,
    conversationId: string | null,
  ): Promise<void> {
    const resolvedConversationId =
      conversationId ?? (await this.getLatestConversationId(privyUserId));

    if (!resolvedConversationId) {
      return;
    }

    const { error } = await this.supabase
      .from("chat_conversations")
      .update({
        cleared_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", resolvedConversationId)
      .eq("privy_user_id", privyUserId);

    if (error) {
      throw error;
    }

    const widget = await this.getWidgetSession(privyUserId);

    const { error: widgetError } = await this.supabase
      .from("chat_widget_sessions")
      .upsert(
        {
          privy_user_id: privyUserId,
          active_conversation_id: null,
          is_open: widget?.isOpen ?? false,
          is_peek_visible: widget?.isPeekVisible ?? false,
          is_peek_dismissed: widget?.isPeekDismissed ?? false,
          draft: widget?.draft ?? "",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "privy_user_id" },
      );

    if (widgetError) {
      throw widgetError;
    }
  }

  async saveWidgetSession(
    privyUserId: string,
    session: ChatWidgetSession,
  ): Promise<void> {
    const activeConversationId = session.activeConversationId
      ? await this.getPersistedConversationId(
          privyUserId,
          session.activeConversationId,
        )
      : null;

    const { error } = await this.supabase.from("chat_widget_sessions").upsert(
      {
        privy_user_id: privyUserId,
        active_conversation_id: activeConversationId,
        is_open: session.isOpen,
        is_peek_visible: session.isPeekVisible,
        is_peek_dismissed: session.isPeekDismissed,
        draft: session.draft,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "privy_user_id" },
    );

    if (error) {
      throw error;
    }
  }

  private async getWidgetSession(
    privyUserId: string,
  ): Promise<ChatWidgetSession | null> {
    const { data, error } = await this.supabase
      .from("chat_widget_sessions")
      .select(
        "privy_user_id, active_conversation_id, is_open, is_peek_visible, is_peek_dismissed, draft, updated_at",
      )
      .eq("privy_user_id", privyUserId)
      .maybeSingle<ChatWidgetSessionRow>();

    if (error) {
      throw error;
    }

    return data ? mapWidgetSession(data) : null;
  }

  private async getLatestConversationId(
    privyUserId: string,
  ): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("chat_conversations")
      .select("id")
      .eq("privy_user_id", privyUserId)
      .is("cleared_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (error) {
      throw error;
    }

    return data?.id ?? null;
  }

  private async getConversation(
    privyUserId: string,
    conversationId: string,
  ): Promise<ChatConversation | null> {
    const conversationRow = await this.getOwnedConversationRow(
      privyUserId,
      conversationId,
    );

    if (!conversationRow) {
      return null;
    }

    const { data: messageRows, error: messageError } = await this.supabase
      .from("chat_messages")
      .select("id, conversation_id, role, content, sent_at, created_at")
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: true })
      .returns<ChatMessageRow[]>();

    if (messageError) {
      throw messageError;
    }

    return mapConversation(
      conversationRow,
      (messageRows || []).map(mapMessage),
    );
  }

  private async getPersistedConversationId(
    privyUserId: string,
    conversationId: string,
  ): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("chat_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("privy_user_id", privyUserId)
      .is("cleared_at", null)
      .maybeSingle<{ id: string }>();

    if (error) {
      throw error;
    }

    return data?.id ?? null;
  }

  private async getConversationRowById(
    conversationId: string,
  ): Promise<ChatConversationRow | null> {
    const { data, error } = await this.supabase
      .from("chat_conversations")
      .select("id, privy_user_id, source, created_at, updated_at, cleared_at")
      .eq("id", conversationId)
      .maybeSingle<ChatConversationRow>();

    if (error) {
      throw error;
    }

    return data;
  }

  private async getOwnedConversationRow(
    privyUserId: string,
    conversationId: string,
  ): Promise<ChatConversationRow | null> {
    const { data, error } = await this.supabase
      .from("chat_conversations")
      .select("id, privy_user_id, source, created_at, updated_at, cleared_at")
      .eq("id", conversationId)
      .eq("privy_user_id", privyUserId)
      .is("cleared_at", null)
      .maybeSingle<ChatConversationRow>();

    if (error) {
      throw error;
    }

    return data;
  }

  private async getMessageRowById(messageId: string): Promise<ChatMessageRow | null> {
    const { data, error } = await this.supabase
      .from("chat_messages")
      .select("id, conversation_id, role, content, sent_at, created_at")
      .eq("id", messageId)
      .maybeSingle<ChatMessageRow>();

    if (error) {
      throw error;
    }

    return data;
  }
}

export const chatService = new ChatService();
