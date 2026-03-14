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
  getPrivyUserFromNextRequest: jest.fn(),
}));

jest.mock("@/lib/chat/server/chat-service", () => ({
  chatService: {
    restoreActiveConversation: jest.fn(),
    saveWidgetSession: jest.fn(),
    createConversation: jest.fn(),
    appendMessages: jest.fn(),
    clearConversation: jest.fn(),
    removeMessage: jest.fn(),
  },
}));

const privy = require("@/lib/auth/privy");
const { chatService } = require("@/lib/chat/server/chat-service");
const sessionRoute = require("@/app/api/chat/session/route");
const conversationsRoute = require("@/app/api/chat/conversations/route");
const messagesRoute = require("@/app/api/chat/conversations/[conversationId]/messages/route");
const messageDeleteRoute = require("@/app/api/chat/conversations/[conversationId]/messages/[messageId]/route");
const currentRoute = require("@/app/api/chat/conversations/current/route");

describe("chat api routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    privy.getPrivyUserFromNextRequest.mockResolvedValue({ id: "did:1" });
  });

  it("restores authenticated chat session", async () => {
    chatService.restoreActiveConversation.mockResolvedValue({
      conversation: null,
      widget: null,
    });

    const res = await sessionRoute.GET({} as any);
    expect(res.status).toBe(200);
    expect(chatService.restoreActiveConversation).toHaveBeenCalledWith("did:1");
  });

  it("returns a shared 401 shape when chat auth is missing", async () => {
    privy.getPrivyUserFromNextRequest.mockResolvedValueOnce(null);

    const res = await sessionRoute.GET({} as any);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: "Authentication required",
    });
  });

  it("creates a conversation through the route layer", async () => {
    chatService.createConversation.mockResolvedValue({ id: "chat_1" });

    const res = await conversationsRoute.POST({
      json: async () => ({
        conversation: {
          id: "chat_1",
          source: "authenticated",
          createdAt: 1,
          updatedAt: 1,
          messages: [],
        },
      }),
    } as any);

    expect(res.status).toBe(200);
    expect(chatService.createConversation).toHaveBeenCalledWith(
      "did:1",
      expect.objectContaining({ id: "chat_1" }),
    );
  });

  it("rejects invalid JSON bodies through the shared route helper", async () => {
    const res = await conversationsRoute.POST({
      json: async () => {
        throw new Error("invalid json");
      },
    } as any);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid JSON body" });
  });

  it("appends messages through the route layer", async () => {
    chatService.appendMessages.mockResolvedValue({ id: "chat_1" });

    const res = await messagesRoute.POST(
      {
        json: async () => ({
          messages: [
            {
              id: "m1",
              role: "user",
              content: "hi",
              ts: 1,
              status: "complete",
              error: null,
            },
          ],
        }),
      } as any,
      { params: Promise.resolve({ conversationId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    expect(chatService.appendMessages).toHaveBeenCalledWith(
      "did:1",
      "chat_1",
      expect.any(Array),
    );
  });

  it("clears the active conversation through the route layer", async () => {
    const req = {
      nextUrl: {
        searchParams: new URLSearchParams("conversationId=chat_1"),
      },
    };

    const res = await currentRoute.DELETE(req as any);
    expect(res.status).toBe(200);
    expect(chatService.clearConversation).toHaveBeenCalledWith(
      "did:1",
      "chat_1",
    );
  });
 
  it("deletes a specific message through the route layer", async () => {
    const res = await messageDeleteRoute.DELETE({} as any, {
      params: Promise.resolve({ conversationId: "chat_1", messageId: "m1" }),
    });
 
    expect(res.status).toBe(200);
    expect(chatService.removeMessage).toHaveBeenCalledWith(
      "did:1",
      "chat_1",
      "m1",
    );
  });

  it("returns 401 when deleting a message without authentication", async () => {
    privy.getPrivyUserFromNextRequest.mockResolvedValueOnce(null);

    const res = await messageDeleteRoute.DELETE({} as any, {
      params: Promise.resolve({ conversationId: "chat_1", messageId: "m1" }),
    });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: "Authentication required",
    });
  });
});
