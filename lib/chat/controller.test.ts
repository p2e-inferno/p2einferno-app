import { chatController } from "@/lib/chat/controller";
import { useChatStore } from "@/lib/chat/store";

describe("chat controller", () => {
  beforeEach(() => {
    window.localStorage.clear();
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
      },
    });

    await chatController.sendMessage("How do I connect my wallet?");

    const state = useChatStore.getState();

    expect(state.messages).toHaveLength(3);
    expect(state.messages[1]?.role).toBe("user");
    expect(state.messages[2]?.role).toBe("assistant");
    expect(state.status).toBe("idle");
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
