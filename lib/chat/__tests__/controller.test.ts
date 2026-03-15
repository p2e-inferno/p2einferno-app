import { chatController } from "@/lib/chat/controller";
import { useChatStore } from "@/lib/chat/store";

describe("chat controller", () => {
  beforeAll(() => {
    jest.spyOn(global, "fetch").mockImplementation(async () => {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            message: {
              id: "assistant_1",
              role: "assistant",
              content:
                "Use the wallet connect button in the header to get started.",
              ts: Date.now(),
              status: "complete",
              error: null,
            },
            sources: [],
          }),
      } as Response;
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    window.sessionStorage.clear();
    useChatStore.setState({
      isOpen: false,
      isPeekVisible: true,
      isPeekDismissed: false,
      draft: "",
      activeConversationId: null,
      messages: [
        {
          id: "seed",
          role: "assistant",
          content:
            "Hey 👋 I’m your in-app guide. Ask me anything — or tap a quick prompt below to get started.",
          ts: Date.now(),
          status: "complete",
          error: null,
        },
      ],
      status: "idle",
      error: null,
      auth: {
        isReady: false,
        isAuthenticated: false,
        privyUserId: null,
        walletAddress: null,
      },
      route: null,
      hasHydrated: false,
      lastHydratedUserId: null,
    });
  });

  it("hydrates and sends messages without resetting across state transitions", async () => {
    await chatController.bootstrap({
      auth: {
        isReady: true,
        isAuthenticated: false,
        privyUserId: null,
        walletAddress: null,
      },
      route: {
        pathname: "/",
        routeKey: "home",
        pageLabel: "Home",
        segment: null,
        behavior: {
          key: "general",
          assistantLabel: "General guide",
          systemHint:
            "Help users orient themselves and find the next useful step in the app.",
        },
      },
    });

    await chatController.sendMessage("How do I connect my wallet?");

    const state = useChatStore.getState();

    expect(state.messages).toHaveLength(3);
    expect(state.messages[1]?.role).toBe("user");
    expect(state.messages[2]?.role).toBe("assistant");
    expect(state.status).toBe("idle");
    expect("sources" in state).toBe(false);
  });

  it("clears the conversation back to the seeded greeting", async () => {
    await chatController.bootstrap({
      auth: {
        isReady: true,
        isAuthenticated: false,
        privyUserId: null,
        walletAddress: null,
      },
      route: {
        pathname: "/",
        routeKey: "home",
        pageLabel: "Home",
        segment: null,
        behavior: {
          key: "general",
          assistantLabel: "General guide",
          systemHint:
            "Help users orient themselves and find the next useful step in the app.",
        },
      },
    });

    await chatController.sendMessage("How do I start?");
    await chatController.clearConversation();

    const state = useChatStore.getState();

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.role).toBe("assistant");
    expect(state.activeConversationId).toBeNull();
  });

  it("rolls back failed durable deletes accurately to preserve chronology", async () => {
    // 1. Setup authenticated state with multiple messages
    const messages: any[] = [
      { id: "m1", role: "assistant", content: "1", ts: 1, status: "complete", error: null },
      { id: "m2", role: "user", content: "2", ts: 2, status: "complete", error: null },
      { id: "m3", role: "assistant", content: "3", ts: 3, status: "complete", error: null },
    ];
    useChatStore.setState({ 
      messages,
      activeConversationId: "chat_1",
      auth: { isReady: true, isAuthenticated: true, privyUserId: "u1", walletAddress: "w1" }
    });

    // 2. Mock fetch to fail for DELETE
    const fetchSpy = global.fetch as jest.Mock;
    fetchSpy.mockImplementationOnce(async (_url, init) => {
      if (init?.method === "DELETE") {
        return { 
          ok: false, 
          status: 500, 
          json: async () => ({ error: "Failed" }),
          text: async () => JSON.stringify({ error: "Failed" })
        };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });

    // 3. Attempt to delete middle message
    await chatController.deleteMessage("m2");

    const state = useChatStore.getState();

    // 4. Verify rollback restored message at the correct index (chronology preserved)
    expect(state.messages).toHaveLength(3);
    expect(state.messages[1]?.id).toBe("m2");
    expect(state.error).toBe("Failed to delete message from server. Please try again.");
  });

  it("restores only the deleted message when durable delete fails after newer updates", async () => {
    useChatStore.setState({
      messages: [
        { id: "m1", role: "assistant", content: "1", ts: 1, status: "complete", error: null },
        { id: "m2", role: "user", content: "2", ts: 2, status: "complete", error: null },
        { id: "m3", role: "assistant", content: "3", ts: 3, status: "complete", error: null },
      ],
      activeConversationId: "chat_1",
      auth: { isReady: true, isAuthenticated: true, privyUserId: "u1", walletAddress: "w1" }
    });

    let rejectDelete: ((reason?: unknown) => void) | null = null;
    const fetchSpy = global.fetch as jest.Mock;
    fetchSpy.mockImplementationOnce(async (_url, init) => {
      if (init?.method === "DELETE") {
        return await new Promise((_resolve, reject) => {
          rejectDelete = reject;
        });
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });

    const deletePromise = chatController.deleteMessage("m2");

    useChatStore.getState().appendMessages([
      {
        id: "m4",
        role: "assistant",
        content: "newer",
        ts: 4,
        status: "complete",
        error: null,
      },
    ]);

    rejectDelete?.(new Error("Failed"));
    await deletePromise;

    const state = useChatStore.getState();
    expect(state.messages.map((message) => message.id)).toEqual([
      "m1",
      "m2",
      "m3",
      "m4",
    ]);
    expect(state.error).toBe("Failed to delete message from server. Please try again.");
  });
});
