const handleUpload = jest.fn();
const resolveChatAttachmentAccessIdentity = jest.fn();
const enforceChatAttachmentUploadLimits = jest.fn();
const persistChatAttachmentOwnership = jest.fn();
const markChatAttachmentUploaded = jest.fn();
const applyChatAnonymousSessionCookie = jest.fn((response) => response);
const isTrustedChatAttachmentOrigin = jest.fn();

jest.mock("next/server", () => {
  class MockHeaders {
    private values = new Map<string, string>();

    constructor(init?: Record<string, string>) {
      if (init) {
        for (const [key, value] of Object.entries(init)) {
          this.values.set(key.toLowerCase(), value);
        }
      }
    }

    get(key: string) {
      return this.values.get(key.toLowerCase()) ?? null;
    }
  }

  class MockResponse {
    status: number;
    headers: MockHeaders;
    body: unknown;
    cookies: { set: jest.Mock };

    constructor(
      body: unknown,
      init: { status?: number; headers?: Record<string, string> } = {},
    ) {
      this.status = init.status ?? 200;
      this.headers = new MockHeaders(init.headers);
      this.body = body;
      this.cookies = { set: jest.fn() };
    }

    static json(
      body: unknown,
      init: { status?: number; headers?: Record<string, string> } = {},
    ) {
      return new MockResponse(body, init);
    }

    async json() {
      return this.body;
    }
  }

  return {
    NextResponse: MockResponse,
  };
});

jest.mock("@vercel/blob/client", () => ({
  handleUpload: (...args: unknown[]) => handleUpload(...args),
}));

jest.mock("@/lib/chat/blob-upload-config", () => ({
  getChatAttachmentCallbackUrl: jest.fn(() => "https://app.example.com/api/chat/attachments/upload"),
  getChatAttachmentUploadConstraints: jest.fn(() => ({
    access: "private",
    allowOverwrite: false,
    maximumSizeInBytes: 5 * 1024 * 1024,
    allowedContentTypes: ["image/png"],
  })),
}));

jest.mock("@/lib/chat/server/attachment-access", () => ({
  applyChatAnonymousSessionCookie: (...args: unknown[]) =>
    applyChatAnonymousSessionCookie(...args),
  enforceChatAttachmentUploadLimits: (...args: unknown[]) =>
    enforceChatAttachmentUploadLimits(...args),
  isTrustedChatAttachmentOrigin: (...args: unknown[]) =>
    isTrustedChatAttachmentOrigin(...args),
  markChatAttachmentUploaded: (...args: unknown[]) =>
    markChatAttachmentUploaded(...args),
  persistChatAttachmentOwnership: (...args: unknown[]) =>
    persistChatAttachmentOwnership(...args),
  resolveChatAttachmentAccessIdentity: (...args: unknown[]) =>
    resolveChatAttachmentAccessIdentity(...args),
}));

const uploadRoute = require("@/app/api/chat/attachments/upload/route");

describe("POST /api/chat/attachments/upload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isTrustedChatAttachmentOrigin.mockReturnValue(true);
    resolveChatAttachmentAccessIdentity.mockResolvedValue({
      authUserId: null,
      hasMembership: false,
      usageIdentity: {
        identityKey: "anon-session:test",
        anonymousSessionId: "anon-test",
        shouldSetAnonymousCookie: true,
        ip: "203.0.113.10",
        privyUserId: null,
      },
    });
    enforceChatAttachmentUploadLimits.mockReturnValue({ allowed: true });
    handleUpload.mockImplementation(async ({ onBeforeGenerateToken, onUploadCompleted }) => {
      const before = await onBeforeGenerateToken(
        "chat-attachments/example.png",
        JSON.stringify({
          attachmentId: "att-1",
          fileName: "example.png",
          clientStartedAt: 123,
        }),
      );
      await onUploadCompleted({
        blob: {
          pathname: "chat-attachments/example.png",
          url: "https://example.private.blob.vercel-storage.com/chat-attachments/example.png",
        },
        tokenPayload: before.tokenPayload,
      });
      return { clientToken: "client-token" };
    });
  });

  function createRequest(body?: unknown) {
    return {
      url: "https://app.example.com/api/chat/attachments/upload",
      nextUrl: { origin: "https://app.example.com" },
      headers: {
        get: jest.fn(() => null),
      },
      cookies: {
        get: jest.fn(),
        getAll: jest.fn(() => []),
      },
      json: async () =>
        body ?? {
          type: "blob.generate-client-token",
          payload: {
            pathname: "chat-attachments/example.png",
            clientPayload: JSON.stringify({
              attachmentId: "att-1",
              fileName: "example.png",
              clientStartedAt: 123,
            }),
            multipart: false,
          },
        },
    };
  }

  it("rejects untrusted origins before issuing upload tokens", async () => {
    isTrustedChatAttachmentOrigin.mockReturnValue(false);

    const res = await uploadRoute.POST(createRequest() as any);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "Untrusted upload origin",
    });
    expect(handleUpload).not.toHaveBeenCalled();
  });

  it("persists attachment ownership before minting the token and marks upload completion", async () => {
    const res = await uploadRoute.POST(createRequest() as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ clientToken: "client-token" });
    expect(persistChatAttachmentOwnership).toHaveBeenCalledWith({
      pathname: "chat-attachments/example.png",
      identity: expect.objectContaining({
        usageIdentity: expect.objectContaining({
          identityKey: "anon-session:test",
        }),
      }),
    });
    expect(markChatAttachmentUploaded).toHaveBeenCalledWith(
      "chat-attachments/example.png",
    );
    expect(applyChatAnonymousSessionCookie).toHaveBeenCalled();
  });
});
