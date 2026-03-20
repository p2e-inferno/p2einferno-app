import { HttpChatAdapter } from "@/lib/chat/adapters/http-chat-adapter";

describe("HttpChatAdapter", () => {
  beforeEach(() => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          message: {
            id: "assistant_1",
            role: "assistant",
            content: "Grounded answer",
            ts: 10,
            status: "complete",
            error: null,
          },
          sources: [{ id: "doc-1", title: "Doc 1" }],
        }),
    } as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("posts the current conversation, route hints, and auth header to the server respond route", async () => {
    const adapter = new HttpChatAdapter();

    const response = await adapter.reply({
      conversationId: "chat_1",
      message: {
        id: "m1",
        role: "user",
        content: "hello",
        ts: 1,
        status: "complete",
        error: null,
        attachments: [
          {
            type: "image",
            data: "data:image/png;base64,Zm9v",
            name: "proof.png",
            size: 3,
          },
        ],
      },
      messages: [
        {
          id: "seed",
          role: "assistant",
          content: "welcome",
          ts: 0,
          status: "complete",
          error: null,
        },
        {
          id: "m1",
          role: "user",
          content: "hello",
          ts: 1,
          status: "complete",
          error: null,
          attachments: [
            {
              type: "image",
              data: "data:image/png;base64,Zm9v",
              name: "proof.png",
              size: 3,
            },
          ],
        },
      ],
      auth: {
        isReady: true,
        isAuthenticated: true,
        privyUserId: "did:1",
        walletAddress: "0x123",
      },
      route: {
        pathname: "/lobby/vendor",
        routeKey: "lobby:vendor",
        pageLabel: "Vendor",
        segment: "lobby",
        behavior: {
          key: "dashboard",
          assistantLabel: "Dashboard guide",
          systemHint: "help",
        },
      },
      assistantContext: {
        mode: "dashboard",
        starterPrompt: "hello",
        systemHint: "help",
      },
      accessToken: "token-123",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/chat/respond",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          Authorization: "Bearer token-123",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          conversationId: "chat_1",
          message: "hello",
          attachments: [
            {
              type: "image",
              data: "data:image/png;base64,Zm9v",
              name: "proof.png",
              size: 3,
            },
          ],
          messages: [
            { role: "assistant", content: "welcome" },
            {
              role: "user",
              content: "hello",
              attachments: [
                {
                  type: "image",
                  data: "data:image/png;base64,Zm9v",
                  name: "proof.png",
                  size: 3,
                },
              ],
            },
          ],
          route: {
            pathname: "/lobby/vendor",
            routeKey: "lobby:vendor",
            segment: "lobby",
            behaviorKey: "dashboard",
          },
        }),
      }),
    );
    expect(response).toEqual({
      mode: "final",
      message: expect.objectContaining({
        id: "assistant_1",
        content: "Grounded answer",
      }),
      sources: [{ id: "doc-1", title: "Doc 1" }],
    });
  });

  it("trims outbound history to the latest 12 valid messages", async () => {
    const adapter = new HttpChatAdapter();

    const messages = Array.from({ length: 15 }, (_, index) => ({
      id: `m-${index}`,
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `message-${index}`,
      ts: index,
      status: "complete" as const,
      error: null,
    }));

    await adapter.reply({
      conversationId: "chat_trim",
      message: messages[messages.length - 1]!,
      messages,
      auth: {
        isReady: true,
        isAuthenticated: true,
        privyUserId: "did:1",
        walletAddress: "0x123",
      },
      route: {
        pathname: "/",
        routeKey: "home",
        pageLabel: "Home",
        segment: null,
        behavior: {
          key: "general",
          assistantLabel: "Guide",
          systemHint: "help",
        },
      },
      assistantContext: {
        mode: "general",
        starterPrompt: "hello",
        systemHint: "help",
      },
      accessToken: "token-123",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/chat/respond",
      expect.objectContaining({
        body: JSON.stringify({
          conversationId: "chat_trim",
          message: "message-14",
          attachments: undefined,
          messages: Array.from({ length: 12 }, (_, index) => {
            const messageIndex = index + 3;
            return {
              role: messageIndex % 2 === 0 ? "user" : "assistant",
              content: `message-${messageIndex}`,
            };
          }),
          route: {
            pathname: "/",
            routeKey: "home",
            segment: null,
            behaviorKey: "general",
          },
        }),
      }),
    );
  });
});
