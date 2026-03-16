import {
  getMockAssistantReply,
  MockChatAdapter,
} from "@/lib/chat/adapters/mock-chat-adapter";
import { createUserMessage } from "@/lib/chat/utils";

const assistantContext = {
  mode: "general" as const,
  systemHint:
    "Help users orient themselves and find the next useful step in the app.",
  starterPrompt:
    "I can help you find the next useful step anywhere in the app.",
};

describe("mock chat adapter", () => {
  it("preserves the wallet guidance branch", async () => {
    const adapter = new MockChatAdapter();
    const response = await adapter.reply({
      conversationId: "chat_123",
      message: createUserMessage("Help me connect my wallet"),
      messages: [],
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
      assistantContext,
    });

    expect(response.mode).toBe("final");
    if (response.mode !== "final") {
      throw new Error("Expected final mock adapter response");
    }
    expect(response.message.content).toContain("Wallet setup (quick)");
  });

  it("keeps the fallback prompt intact", () => {
    const reply = getMockAssistantReply({
      conversationId: "chat_123",
      message: createUserMessage("hello there"),
      messages: [],
      auth: {
        isReady: true,
        isAuthenticated: false,
        privyUserId: null,
        walletAddress: null,
      },
      route: null,
      assistantContext,
    });

    expect(reply).toContain("learn");
    expect(reply).toContain("earn");
    expect(reply).toContain("build");
    expect(reply).toContain(assistantContext.starterPrompt);
  });
});
