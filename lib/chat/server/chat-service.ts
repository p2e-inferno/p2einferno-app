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
    const conversationId =
      widget?.activeConversationId ??
      (await this.getLatestConversationId(privyUserId));

    if (!conversationId) {
      return { conversation: null, widget };
    }

    const conversation = await this.getConversation(
      privyUserId,
      conversationId,
    );
    return { conversation, widget };
  }

  async createConversation(
    privyUserId: string,
    conversation: ChatConversation,
  ): Promise<ChatConversation> {
    const now = new Date().toISOString();
    const source: ChatConversation["source"] = "authenticated";
    const { error } = await this.supabase.from("chat_conversations").upsert(
      {
        id: conversation.id,
        privy_user_id: privyUserId,
        source,
        created_at: now,
        updated_at: now,
        cleared_at: null,
      },
      { onConflict: "id" },
    );

    if (error) {
      throw error;
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

    const { error: insertError } = await this.supabase
      .from("chat_messages")
      .upsert(
        messages.map((message) => ({
          id: message.id,
          conversation_id: conversationId,
          role: message.role,
          content: message.content,
          sent_at: new Date(message.ts).toISOString(),
        })),
        { onConflict: "id" },
      );

    if (insertError) {
      throw insertError;
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
}

export const chatService = new ChatService();
