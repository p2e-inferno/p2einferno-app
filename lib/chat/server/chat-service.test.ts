import { ChatService } from "@/lib/chat/server/chat-service";

type QueryResult<T> = { data: T; error: null } | { data: null; error: Error };

function makeSelectBuilder<T>(result: QueryResult<T>) {
  const builder: any = {
    eq: jest.fn(() => builder),
    is: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    maybeSingle: jest.fn(async () => result),
    returns: jest.fn(async () => result),
  };

  return builder;
}

function makeSupabaseMock(config: {
  widgetResult?: QueryResult<any>;
  latestConversationResult?: QueryResult<any>;
  conversationResult?: QueryResult<any>;
  messagesResult?: QueryResult<any>;
  persistedConversationResult?: QueryResult<any>;
}) {
  const widgetSelect = makeSelectBuilder(
    config.widgetResult || { data: null, error: null },
  );
  const latestSelect = makeSelectBuilder(
    config.latestConversationResult || { data: null, error: null },
  );
  const conversationSelect = makeSelectBuilder(
    config.conversationResult || { data: null, error: null },
  );
  const messagesSelect = makeSelectBuilder(
    config.messagesResult || { data: [], error: null },
  );
  const persistedSelect = makeSelectBuilder(
    config.persistedConversationResult || { data: null, error: null },
  );

  const updateConversation = {
    eq: jest.fn(function () {
      return this;
    }),
    then: (
      resolve: (value: { data: null; error: null }) => void,
      _reject?: (reason?: unknown) => void,
    ) => resolve({ data: null, error: null }),
  } as any;

  const conversationUpsertMock = jest.fn().mockResolvedValue({ error: null });
  const messagesUpsertMock = jest.fn().mockResolvedValue({ error: null });

  return {
    from: jest.fn((table: string) => {
      if (table === "chat_widget_sessions") {
        return {
          select: jest.fn(() => widgetSelect),
          upsert: conversationUpsertMock,
        };
      }

      if (table === "chat_conversations") {
        return {
          select: jest.fn((fields: string) => {
            if (fields.includes("source")) {
              return conversationSelect;
            }

            if (config.latestConversationResult) {
              return latestSelect;
            }

            return persistedSelect;
          }),
          upsert: conversationUpsertMock,
          update: jest.fn(() => updateConversation),
        };
      }

      if (table === "chat_messages") {
        return {
          select: jest.fn(() => messagesSelect),
          upsert: messagesUpsertMock,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
    __conversationUpsert: conversationUpsertMock,
    __messagesUpsert: messagesUpsertMock,
  };
}

describe("ChatService", () => {
  it("restores the active conversation with messages", async () => {
    const supabase = makeSupabaseMock({
      widgetResult: {
        data: {
          privy_user_id: "did:1",
          active_conversation_id: "chat_1",
          is_open: true,
          is_peek_visible: false,
          is_peek_dismissed: true,
          draft: "",
          updated_at: new Date(1).toISOString(),
        },
        error: null,
      },
      conversationResult: {
        data: {
          id: "chat_1",
          privy_user_id: "did:1",
          source: "authenticated",
          created_at: new Date(1).toISOString(),
          updated_at: new Date(2).toISOString(),
          cleared_at: null,
        },
        error: null,
      },
      messagesResult: {
        data: [
          {
            id: "m1",
            conversation_id: "chat_1",
            role: "assistant",
            content: "hello",
            sent_at: new Date(1).toISOString(),
            created_at: new Date(1).toISOString(),
          },
        ],
        error: null,
      },
    });

    const service = new ChatService(supabase as any);
    const result = await service.restoreActiveConversation("did:1");

    expect(result.conversation?.id).toBe("chat_1");
    expect(result.widget?.activeConversationId).toBe("chat_1");
    expect(result.conversation?.messages[0]?.content).toBe("hello");
  });

  it("creates and appends messages to a durable conversation", async () => {
    const supabase = makeSupabaseMock({
      conversationResult: {
        data: {
          id: "chat_1",
          privy_user_id: "did:1",
          source: "authenticated",
          created_at: new Date(1).toISOString(),
          updated_at: new Date(3).toISOString(),
          cleared_at: null,
        },
        error: null,
      },
      messagesResult: {
        data: [
          {
            id: "m1",
            conversation_id: "chat_1",
            role: "user",
            content: "hi",
            sent_at: new Date(2).toISOString(),
            created_at: new Date(2).toISOString(),
          },
        ],
        error: null,
      },
    });

    const service = new ChatService(supabase as any);
    await service.createConversation("did:1", {
      id: "chat_1",
      source: "anonymous",
      createdAt: 1,
      updatedAt: 1,
      messages: [],
    });
    const conversation = await service.appendMessages("did:1", "chat_1", [
      {
        id: "m1",
        role: "user",
        content: "hi",
        ts: 2,
        status: "complete",
        error: null,
      },
    ]);

    expect(supabase.__conversationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "authenticated",
        created_at: expect.any(String),
      }),
      { onConflict: "id" },
    );
    expect(supabase.__conversationUpsert.mock.calls[0][0].created_at).not.toBe(
      new Date(1).toISOString(),
    );
    expect(supabase.__messagesUpsert).toHaveBeenCalled();
    expect(conversation?.messages[0]?.content).toBe("hi");
  });

  it("clears the latest active conversation when no conversation id is provided", async () => {
    const supabase = makeSupabaseMock({
      latestConversationResult: {
        data: { id: "chat_latest" },
        error: null,
      },
    });

    const service = new ChatService(supabase as any);
    await expect(
      service.clearConversation("did:1", null),
    ).resolves.toBeUndefined();
  });

  it("drops invalid active conversation ids when saving widget sessions", async () => {
    const supabase = makeSupabaseMock({
      persistedConversationResult: {
        data: null,
        error: null,
      },
    });

    const service = new ChatService(supabase as any);
    await service.saveWidgetSession("did:1", {
      isOpen: true,
      isPeekVisible: false,
      isPeekDismissed: true,
      draft: "hello",
      activeConversationId: "missing_chat",
    });

    expect(supabase.__conversationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        active_conversation_id: null,
      }),
      { onConflict: "privy_user_id" },
    );
  });

  it("verifies conversation ownership before inserting chat messages", async () => {
    const supabase = makeSupabaseMock({
      conversationResult: {
        data: null,
        error: null,
      },
    });

    const service = new ChatService(supabase as any);

    await expect(
      service.appendMessages("did:1", "missing_chat", [
        {
          id: "m1",
          role: "user",
          content: "hi",
          ts: 2,
          status: "complete",
          error: null,
        },
      ]),
    ).rejects.toThrow("Conversation not found");
    expect(supabase.__messagesUpsert).not.toHaveBeenCalled();
  });
});
