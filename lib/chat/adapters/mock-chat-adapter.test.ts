import { getMockAssistantReply, MockChatAdapter } from "@/lib/chat/adapters/mock-chat-adapter";
import { createUserMessage } from "@/lib/chat/utils";

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
      },
    });

    expect(response.message.content).toContain("Wallet setup (quick)");
  });

  it("keeps the fallback prompt intact", () => {
    expect(getMockAssistantReply("hello there")).toContain("learn");
    expect(getMockAssistantReply("hello there")).toContain("earn");
    expect(getMockAssistantReply("hello there")).toContain("build");
  });
});
