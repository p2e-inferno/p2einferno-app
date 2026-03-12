import { getChatSessionPersistence } from "@/lib/chat/session";

describe("getChatSessionPersistence", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("does not create an authenticated fallback bucket before Privy user id is known", async () => {
    const persistence = getChatSessionPersistence(
      {
        isReady: true,
        isAuthenticated: true,
        privyUserId: null,
        walletAddress: "0x123",
      },
      "token",
    );

    await persistence.fallbackRepository.createConversation({
      id: "chat_anon_like",
      source: "anonymous",
      createdAt: 1,
      updatedAt: 1,
      messages: [],
    });

    expect(
      sessionStorage.getItem("chat-widget:authenticated-conversation:unknown"),
    ).toBeNull();
    expect(
      sessionStorage.getItem("chat-widget:anonymous-conversation"),
    ).not.toBeNull();
  });
});
