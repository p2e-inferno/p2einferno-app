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
});
