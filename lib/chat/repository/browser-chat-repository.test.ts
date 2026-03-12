import { BrowserChatRepository } from "@/lib/chat/repository/browser-chat-repository";

describe("BrowserChatRepository", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("scopes authenticated fallback state by Privy user id", async () => {
    const firstUserRepository = new BrowserChatRepository({
      authenticated: true,
      privyUserId: "did:privy:first",
    });
    const secondUserRepository = new BrowserChatRepository({
      authenticated: true,
      privyUserId: "did:privy:second",
    });

    await firstUserRepository.createConversation({
      id: "chat_first",
      source: "authenticated",
      createdAt: 1,
      updatedAt: 1,
      messages: [],
    });
    await firstUserRepository.saveWidgetSession({
      isOpen: true,
      isPeekVisible: false,
      isPeekDismissed: false,
      draft: "hello",
      activeConversationId: "chat_first",
    });

    await secondUserRepository.createConversation({
      id: "chat_second",
      source: "authenticated",
      createdAt: 2,
      updatedAt: 2,
      messages: [],
    });

    await expect(
      firstUserRepository.restoreActiveConversation(),
    ).resolves.toEqual({
      conversation: expect.objectContaining({ id: "chat_first" }),
      widget: expect.objectContaining({ activeConversationId: "chat_first" }),
    });
    await expect(
      secondUserRepository.restoreActiveConversation(),
    ).resolves.toEqual({
      conversation: expect.objectContaining({ id: "chat_second" }),
      widget: null,
    });
  });

  it("clears legacy authenticated fallback keys when a scoped repository runs", async () => {
    sessionStorage.setItem(
      "chat-widget:authenticated-conversation",
      JSON.stringify({ id: "legacy" }),
    );
    sessionStorage.setItem(
      "chat-widget:authenticated-widget",
      JSON.stringify({ activeConversationId: "legacy" }),
    );

    const repository = new BrowserChatRepository({
      authenticated: true,
      privyUserId: "did:privy:first",
    });

    await repository.restoreActiveConversation();

    expect(
      sessionStorage.getItem("chat-widget:authenticated-conversation"),
    ).toBeNull();
    expect(
      sessionStorage.getItem("chat-widget:authenticated-widget"),
    ).toBeNull();
  });
});
