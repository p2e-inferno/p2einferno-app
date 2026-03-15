import { ChatService } from "@/lib/chat/server/chat-service";

type ConversationRow = {
  id: string;
  privy_user_id: string;
  source: "anonymous" | "authenticated";
  created_at: string;
  updated_at: string;
  cleared_at: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  sent_at: string;
  created_at: string;
  attachments?: Array<{
    type: "image" | "video";
    pathname: string;
    name: string | null;
    size: number | null;
  }> | null;
};

type WidgetRow = {
  privy_user_id: string;
  active_conversation_id: string | null;
  is_open: boolean;
  is_peek_visible: boolean;
  is_peek_dismissed: boolean;
  draft: string;
  updated_at: string;
};

type TableName = "chat_conversations" | "chat_messages" | "chat_widget_sessions";

type Tables = {
  chat_conversations: ConversationRow[];
  chat_messages: MessageRow[];
  chat_widget_sessions: WidgetRow[];
};

function makeQueryBuilder<T extends Record<string, unknown>>(applyFilters: () => T[]) {
  const builder: any = {
    eq: jest.fn((column: string, value: unknown) => {
      const previous = applyFilters;
      applyFilters = () =>
        previous().filter((row) => row[column as keyof T] === value);
      return builder;
    }),
    is: jest.fn((column: string, value: unknown) => {
      const previous = applyFilters;
      applyFilters = () =>
        previous().filter((row) => row[column as keyof T] === value);
      return builder;
    }),
    order: jest.fn(
      (column: string, options?: { ascending?: boolean }) => {
        const previous = applyFilters;
        applyFilters = () => {
          const nextRows = [...previous()];
          nextRows.sort((left, right) => {
            const leftValue = left[column as keyof T];
            const rightValue = right[column as keyof T];
            if (leftValue === rightValue) {
              return 0;
            }
            if (leftValue == null) {
              return -1;
            }
            if (rightValue == null) {
              return 1;
            }
            return leftValue < rightValue ? -1 : 1;
          });
          return options?.ascending === false ? nextRows.reverse() : nextRows;
        };
        return builder;
      },
    ),
    limit: jest.fn((count: number) => {
      const previous = applyFilters;
      applyFilters = () => previous().slice(0, count);
      return builder;
    }),
    maybeSingle: jest.fn(async () => {
      const filtered = applyFilters();
      return { data: filtered[0] ?? null, error: null };
    }),
    returns: jest.fn(async () => ({ data: applyFilters(), error: null })),
  };

  return builder;
}

function makeUpdateBuilder<T extends Record<string, unknown>>(
  rows: T[],
  patch: Partial<T>,
) {
  let filters: Array<(row: T) => boolean> = [];

  const builder: any = {
    eq: jest.fn((column: string, value: unknown) => {
      filters.push((row) => row[column as keyof T] === value);
      return builder;
    }),
    is: jest.fn((column: string, value: unknown) => {
      filters.push((row) => row[column as keyof T] === value);
      return builder;
    }),
    then: (
      resolve: (value: { data: null; error: null }) => void,
      _reject?: (reason?: unknown) => void,
    ) => {
      for (const row of rows) {
        if (filters.every((filter) => filter(row))) {
          Object.assign(row, patch);
        }
      }
      resolve({ data: null, error: null });
    },
  };

  return builder;
}

function makeSupabaseMock(seed?: Partial<Tables>) {
  const tables: Tables = {
    chat_conversations: [...(seed?.chat_conversations ?? [])],
    chat_messages: [...(seed?.chat_messages ?? [])],
    chat_widget_sessions: [...(seed?.chat_widget_sessions ?? [])],
  };

  const conversationInsert = jest.fn(async (payload: ConversationRow) => {
    tables.chat_conversations.push({ ...payload });
    return { data: null, error: null };
  });

  const conversationUpdate = jest.fn((patch: Partial<ConversationRow>) =>
    makeUpdateBuilder(tables.chat_conversations, patch),
  );

  const messageInsert = jest.fn(async (payload: MessageRow) => {
    tables.chat_messages.push({
      ...payload,
      created_at: payload.created_at ?? new Date().toISOString(),
    });
    return { data: null, error: null };
  });

  const messageUpdate = jest.fn((patch: Partial<MessageRow>) =>
    makeUpdateBuilder(tables.chat_messages, patch),
  );

  const widgetUpsert = jest.fn(async (payload: WidgetRow) => {
    const existingIndex = tables.chat_widget_sessions.findIndex(
      (row) => row.privy_user_id === payload.privy_user_id,
    );

    if (existingIndex >= 0) {
      tables.chat_widget_sessions[existingIndex] = {
        ...tables.chat_widget_sessions[existingIndex],
        ...payload,
      };
    } else {
      tables.chat_widget_sessions.push({ ...payload });
    }

    return { data: null, error: null };
  });

  return {
    from: jest.fn((table: TableName) => {
      if (table === "chat_conversations") {
        return {
          select: jest.fn(() =>
            makeQueryBuilder(() => tables.chat_conversations),
          ),
          insert: conversationInsert,
          update: conversationUpdate,
        };
      }

      if (table === "chat_messages") {
        return {
          select: jest.fn(() =>
            makeQueryBuilder(() => tables.chat_messages),
          ),
          insert: messageInsert,
          update: messageUpdate,
        };
      }

      if (table === "chat_widget_sessions") {
        return {
          select: jest.fn(() =>
            makeQueryBuilder(() => tables.chat_widget_sessions),
          ),
          upsert: widgetUpsert,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
    __tables: tables,
    __conversationInsert: conversationInsert,
    __conversationUpdate: conversationUpdate,
    __messageInsert: messageInsert,
    __messageUpdate: messageUpdate,
    __widgetUpsert: widgetUpsert,
  };
}

describe("ChatService", () => {
  it("restores the active conversation with messages", async () => {
    const supabase = makeSupabaseMock({
      chat_widget_sessions: [
        {
          privy_user_id: "did:1",
          active_conversation_id: "chat_1",
          is_open: true,
          is_peek_visible: false,
          is_peek_dismissed: true,
          draft: "",
          updated_at: new Date(1).toISOString(),
        },
      ],
      chat_conversations: [
        {
          id: "chat_1",
          privy_user_id: "did:1",
          source: "authenticated",
          created_at: new Date(1).toISOString(),
          updated_at: new Date(2).toISOString(),
          cleared_at: null,
        },
      ],
      chat_messages: [
        {
          id: "m1",
          conversation_id: "chat_1",
          role: "assistant",
          content: "hello",
          sent_at: new Date(1).toISOString(),
          created_at: new Date(1).toISOString(),
        },
      ],
    });

    const service = new ChatService(supabase as any);
    const result = await service.restoreActiveConversation("did:1");

    expect(result.conversation?.id).toBe("chat_1");
    expect(result.widget?.activeConversationId).toBe("chat_1");
    expect(result.conversation?.messages[0]?.content).toBe("hello");
  });

  it("falls back to the latest valid conversation when the widget pointer is stale", async () => {
    const supabase = makeSupabaseMock({
      chat_widget_sessions: [
        {
          privy_user_id: "did:1",
          active_conversation_id: "chat_stale",
          is_open: true,
          is_peek_visible: true,
          is_peek_dismissed: false,
          draft: "draft",
          updated_at: new Date(1).toISOString(),
        },
      ],
      chat_conversations: [
        {
          id: "chat_latest",
          privy_user_id: "did:1",
          source: "authenticated",
          created_at: new Date(2).toISOString(),
          updated_at: new Date(3).toISOString(),
          cleared_at: null,
        },
      ],
      chat_messages: [
        {
          id: "m1",
          conversation_id: "chat_latest",
          role: "assistant",
          content: "restored",
          sent_at: new Date(2).toISOString(),
          created_at: new Date(2).toISOString(),
        },
      ],
    });

    const service = new ChatService(supabase as any);
    const result = await service.restoreActiveConversation("did:1");

    expect(result.conversation?.id).toBe("chat_latest");
    expect(result.widget?.activeConversationId).toBe("chat_latest");
    expect(supabase.__tables.chat_widget_sessions[0]?.active_conversation_id).toBe(
      "chat_latest",
    );
  });

  it("creates and appends messages to a durable conversation", async () => {
    const supabase = makeSupabaseMock({
      chat_conversations: [
        {
          id: "chat_1",
          privy_user_id: "did:1",
          source: "authenticated",
          created_at: new Date(1).toISOString(),
          updated_at: new Date(1).toISOString(),
          cleared_at: null,
        },
      ],
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

    expect(supabase.__conversationInsert).not.toHaveBeenCalled();
    expect(supabase.__messageInsert).toHaveBeenCalledTimes(1);
    expect(conversation?.messages[0]?.content).toBe("hi");
  });

  it("persists direct blob URLs as attachment pathnames and reconstructs proxy paths on restore", async () => {
    const supabase = makeSupabaseMock({
      chat_conversations: [
        {
          id: "chat_1",
          privy_user_id: "did:1",
          source: "authenticated",
          created_at: new Date(1).toISOString(),
          updated_at: new Date(1).toISOString(),
          cleared_at: null,
        },
      ],
    });

    const service = new ChatService(supabase as any);
    const conversation = await service.appendMessages("did:1", "chat_1", [
      {
        id: "m1",
        role: "user",
        content: "",
        ts: 2,
        status: "complete",
        error: null,
        attachments: [
          {
            type: "image",
            data: "https://example.private.blob.vercel-storage.com/chat-attachments/test.png?download=1",
            name: "test.png",
            size: 123,
          },
        ],
      },
    ]);

    expect(supabase.__tables.chat_messages[0]?.attachments).toEqual([
      {
        type: "image",
        pathname: "chat-attachments/test.png",
        name: "test.png",
        size: 123,
      },
    ]);
    expect(conversation?.messages[0]?.attachments).toEqual([
      {
        type: "image",
        data: "/api/chat/attachments/upload/file?pathname=chat-attachments%2Ftest.png",
        name: "test.png",
        size: 123,
      },
    ]);
  });

  it("rejects creating a conversation that already belongs to another user", async () => {
    const supabase = makeSupabaseMock({
      chat_conversations: [
        {
          id: "chat_1",
          privy_user_id: "did:other",
          source: "authenticated",
          created_at: new Date(1).toISOString(),
          updated_at: new Date(1).toISOString(),
          cleared_at: null,
        },
      ],
    });

    const service = new ChatService(supabase as any);

    await expect(
      service.createConversation("did:1", {
        id: "chat_1",
        source: "anonymous",
        createdAt: 1,
        updatedAt: 1,
        messages: [],
      }),
    ).rejects.toThrow("Conversation already belongs to another user");

    expect(supabase.__tables.chat_conversations[0]?.privy_user_id).toBe(
      "did:other",
    );
  });

  it("clears the latest active conversation when no conversation id is provided", async () => {
    const supabase = makeSupabaseMock({
      chat_conversations: [
        {
          id: "chat_latest",
          privy_user_id: "did:1",
          source: "authenticated",
          created_at: new Date(1).toISOString(),
          updated_at: new Date(2).toISOString(),
          cleared_at: null,
        },
      ],
    });

    const service = new ChatService(supabase as any);
    await expect(
      service.clearConversation("did:1", null),
    ).resolves.toBeUndefined();
  });

  it("drops invalid active conversation ids when saving widget sessions", async () => {
    const supabase = makeSupabaseMock();
    const service = new ChatService(supabase as any);

    await service.saveWidgetSession("did:1", {
      isOpen: true,
      isPeekVisible: false,
      isPeekDismissed: true,
      draft: "hello",
      activeConversationId: "missing_chat",
    });

    expect(supabase.__tables.chat_widget_sessions[0]?.active_conversation_id).toBe(
      null,
    );
  });

  it("verifies conversation ownership before inserting chat messages", async () => {
    const supabase = makeSupabaseMock();
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

    expect(supabase.__messageInsert).not.toHaveBeenCalled();
  });

  it("rejects message id collisions from another conversation", async () => {
    const supabase = makeSupabaseMock({
      chat_conversations: [
        {
          id: "chat_1",
          privy_user_id: "did:1",
          source: "authenticated",
          created_at: new Date(1).toISOString(),
          updated_at: new Date(1).toISOString(),
          cleared_at: null,
        },
        {
          id: "chat_other",
          privy_user_id: "did:other",
          source: "authenticated",
          created_at: new Date(1).toISOString(),
          updated_at: new Date(1).toISOString(),
          cleared_at: null,
        },
      ],
      chat_messages: [
        {
          id: "m1",
          conversation_id: "chat_other",
          role: "assistant",
          content: "original",
          sent_at: new Date(1).toISOString(),
          created_at: new Date(1).toISOString(),
        },
      ],
    });

    const service = new ChatService(supabase as any);

    await expect(
      service.appendMessages("did:1", "chat_1", [
        {
          id: "m1",
          role: "user",
          content: "tamper",
          ts: 2,
          status: "complete",
          error: null,
        },
      ]),
    ).rejects.toThrow("Message already belongs to another conversation");

    expect(supabase.__tables.chat_messages[0]?.conversation_id).toBe(
      "chat_other",
    );
    expect(supabase.__tables.chat_messages[0]?.content).toBe("original");
  });
});
