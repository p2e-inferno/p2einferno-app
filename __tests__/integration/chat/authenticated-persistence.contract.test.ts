let currentUserId = "did:1";
let currentSupabase: ReturnType<typeof createFakeSupabase>;

interface ConversationRow {
  [key: string]: string | null | undefined;
  id: string;
  privy_user_id: string;
  source: "anonymous" | "authenticated";
  created_at: string;
  updated_at: string;
  cleared_at: string | null;
}

interface WidgetRow {
  [key: string]: string | boolean | null;
  privy_user_id: string;
  is_open: boolean;
  is_peek_visible: boolean;
  is_peek_dismissed: boolean;
  draft: string;
  active_conversation_id: string | null;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
  status: "complete" | "streaming" | "error";
  error: string | null;
}

jest.mock("next/server", () => ({
  NextResponse: class {
    static json(body: unknown, init: { status?: number } = {}) {
      return {
        status: init.status || 200,
        json: async () => body,
      };
    }
  },
}));

jest.mock("@/lib/auth/privy", () => ({
  getPrivyUserFromNextRequest: jest.fn(async () =>
    currentUserId ? { id: currentUserId } : null,
  ),
}));

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(() => currentSupabase),
}));

function createFakeSupabase() {
  const conversations = new Map<string, ConversationRow>();
  const widgets = new Map<string, WidgetRow>();
  const messages = new Map<string, MessageRow[]>();

  const makeConversationSelect = () => {
    let filters: Record<string, string | null> = {};
    let requireClearedNull = false;
    let orderBy: string | null = null;
    let orderAscending = true;
    let limitValue: number | null = null;

    const builder: any = {
      eq(field: string, value: any) {
        filters[field] = value;
        return builder;
      },
      is(field: string, value: any) {
        if (field === "cleared_at" && value === null) {
          requireClearedNull = true;
        }
        return builder;
      },
      order(field: string, options?: { ascending?: boolean }) {
        orderBy = field;
        orderAscending = options?.ascending ?? true;
        return builder;
      },
      limit(value: number) {
        limitValue = value;
        return builder;
      },
      async maybeSingle() {
        let rows = Array.from(conversations.values()).filter((row) => {
          return Object.entries(filters).every(
            ([field, value]) => row[field] === value,
          );
        });

        if (requireClearedNull) {
          rows = rows.filter((row) => row.cleared_at == null);
        }

        if (orderBy) {
          rows.sort((left, right) => {
            const leftValue = left[orderBy!];
            const rightValue = right[orderBy!];
            if (leftValue === rightValue) return 0;
            return orderAscending
              ? (leftValue ?? "") < (rightValue ?? "")
                ? -1
                : 1
              : (leftValue ?? "") > (rightValue ?? "")
                ? -1
                : 1;
          });
        }

        if (limitValue !== null) {
          rows = rows.slice(0, limitValue);
        }

        return { data: rows[0] ?? null, error: null };
      },
    };

    return builder;
  };

  const makeWidgetSelect = () => {
    let filters: Record<string, string | boolean | null> = {};

    const builder: any = {
      eq(field: string, value: any) {
        filters[field] = value;
        return builder;
      },
      async maybeSingle() {
        const row =
          Array.from(widgets.values()).find((entry) =>
            Object.entries(filters).every(
              ([field, value]) => entry[field] === value,
            ),
          ) ?? null;
        return { data: row, error: null };
      },
    };

    return builder;
  };

  const makeMessageSelect = () => {
    let conversationId: string | null = null;

    const builder: any = {
      eq(field: string, value: any) {
        if (field === "conversation_id") {
          conversationId = value;
        }
        return builder;
      },
      order() {
        return builder;
      },
      async returns() {
        return {
          data: [...(messages.get(conversationId || "") || [])],
          error: null,
        };
      },
    };

    return builder;
  };

  const makeConversationUpdate = () => {
    return (payload: Partial<ConversationRow>) => {
      const filters: Record<string, string | null> = {};

      const builder: any = {
        eq(field: string, value: string | null) {
          filters[field] = value;
          return builder;
        },
        then(
          resolve: (value: { data: null; error: null }) => void,
          reject?: (reason?: unknown) => void,
        ) {
          try {
            for (const row of conversations.values()) {
              const matches = Object.entries(filters).every(
                ([filterField, filterValue]) =>
                  row[filterField as keyof ConversationRow] === filterValue,
              );
              if (matches) {
                conversations.set(row.id, { ...row, ...payload });
              }
            }

            resolve({ data: null, error: null });
          } catch (error) {
            reject?.(error);
          }
        },
      };

      return builder;
    };
  };

  const updateConversation = makeConversationUpdate();

  return {
    from(table: string) {
      if (table === "chat_conversations") {
        return {
          select: jest.fn(() => makeConversationSelect()),
          upsert: jest.fn(async (payload: ConversationRow) => {
            conversations.set(payload.id, payload);
            return { error: null };
          }),
          update: jest.fn((payload: Partial<ConversationRow>) =>
            updateConversation(payload),
          ),
        };
      }

      if (table === "chat_messages") {
        return {
          select: jest.fn(() => makeMessageSelect()),
          upsert: jest.fn(async (payload: MessageRow[]) => {
            for (const row of payload) {
              const existing = messages.get(row.conversation_id) || [];
              const deduped = existing.filter((entry) => entry.id !== row.id);
              messages.set(row.conversation_id, [...deduped, row]);
            }
            return { error: null };
          }),
        };
      }

      if (table === "chat_widget_sessions") {
        return {
          select: jest.fn(() => makeWidgetSelect()),
          upsert: jest.fn(async (payload: WidgetRow) => {
            widgets.set(payload.privy_user_id, payload);
            return { error: null };
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

function loadRoutes() {
  const sessionRoute = require("@/app/api/chat/session/route");
  const conversationsRoute = require("@/app/api/chat/conversations/route");
  const messagesRoute = require("@/app/api/chat/conversations/[conversationId]/messages/route");
  const currentRoute = require("@/app/api/chat/conversations/current/route");

  return {
    sessionRoute,
    conversationsRoute,
    messagesRoute,
    currentRoute,
  };
}

describe("authenticated chat route/service persistence contract", () => {
  beforeEach(() => {
    jest.resetModules();
    currentUserId = "did:1";
    currentSupabase = createFakeSupabase();
  });

  it("persists and restores an authenticated conversation through the real route/service boundary", async () => {
    const { conversationsRoute, messagesRoute, sessionRoute } = loadRoutes();

    await conversationsRoute.POST({
      json: async () => ({
        conversation: {
          id: "chat_auth_1",
          source: "anonymous",
          createdAt: 1,
          updatedAt: 1,
          messages: [],
        },
      }),
    } as any);

    await messagesRoute.POST(
      {
        json: async () => ({
          messages: [
            {
              id: "m1",
              role: "user",
              content: "hello",
              ts: 2,
              status: "complete",
              error: null,
            },
          ],
        }),
      } as any,
      { params: Promise.resolve({ conversationId: "chat_auth_1" }) },
    );

    await sessionRoute.PUT({
      json: async () => ({
        widget: {
          isOpen: true,
          isPeekVisible: false,
          isPeekDismissed: true,
          draft: "",
          activeConversationId: "chat_auth_1",
        },
      }),
    } as any);

    const restored = await sessionRoute.GET({} as any);
    const payload = await restored.json();

    expect(restored.status).toBe(200);
    expect(payload.conversation).toEqual(
      expect.objectContaining({
        id: "chat_auth_1",
        source: "authenticated",
      }),
    );
    expect(payload.conversation.messages).toEqual([
      expect.objectContaining({ id: "m1", content: "hello" }),
    ]);
    expect(payload.widget).toEqual(
      expect.objectContaining({ activeConversationId: "chat_auth_1" }),
    );
  });

  it("keeps authenticated restores isolated across auth transitions and clear success", async () => {
    const { conversationsRoute, messagesRoute, sessionRoute, currentRoute } =
      loadRoutes();

    await conversationsRoute.POST({
      json: async () => ({
        conversation: {
          id: "chat_auth_1",
          source: "authenticated",
          createdAt: 1,
          updatedAt: 1,
          messages: [],
        },
      }),
    } as any);

    await messagesRoute.POST(
      {
        json: async () => ({
          messages: [
            {
              id: "m1",
              role: "user",
              content: "hello",
              ts: 2,
              status: "complete",
              error: null,
            },
          ],
        }),
      } as any,
      { params: Promise.resolve({ conversationId: "chat_auth_1" }) },
    );

    await sessionRoute.PUT({
      json: async () => ({
        widget: {
          isOpen: true,
          isPeekVisible: false,
          isPeekDismissed: false,
          draft: "",
          activeConversationId: "chat_auth_1",
        },
      }),
    } as any);

    currentUserId = "did:2";
    const secondUserRestore = await sessionRoute.GET({} as any);
    await expect(secondUserRestore.json()).resolves.toEqual({
      conversation: null,
      widget: null,
    });

    currentUserId = "did:1";
    const firstUserRestore = await sessionRoute.GET({} as any);
    const firstUserPayload = await firstUserRestore.json();
    expect(firstUserPayload.conversation?.id).toBe("chat_auth_1");

    const clearRes = await currentRoute.DELETE({
      nextUrl: {
        searchParams: new URLSearchParams("conversationId=chat_auth_1"),
      },
    } as any);
    expect(clearRes.status).toBe(200);

    const afterClear = await sessionRoute.GET({} as any);
    await expect(afterClear.json()).resolves.toEqual({
      conversation: null,
      widget: expect.objectContaining({
        activeConversationId: null,
      }),
    });
  });
});
