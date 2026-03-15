export {};

const getMock = jest.fn();
const resolveChatAttachmentAccessIdentityMock = jest.fn();
const assertChatAttachmentOwnershipMock = jest.fn();

jest.mock("next/server", () => {
  class MockResponse {
    status: number;
    headers: Headers;
    body: unknown;

    constructor(
      body: unknown,
      init: { status?: number; headers?: Record<string, string> } = {},
    ) {
      this.status = init.status ?? 200;
      this.headers = new Headers(init.headers);
      this.body = body;
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

jest.mock("@vercel/blob", () => ({
  get: (...args: any[]) => getMock(...args),
}));

class MockChatAttachmentAccessError extends Error {}

jest.mock("@/lib/chat/server/attachment-access", () => ({
  ChatAttachmentAccessError: MockChatAttachmentAccessError,
  assertChatAttachmentOwnership: (...args: any[]) =>
    assertChatAttachmentOwnershipMock(...args),
  resolveChatAttachmentAccessIdentity: (...args: any[]) =>
    resolveChatAttachmentAccessIdentityMock(...args),
}));

const fileRoute = require("@/app/api/chat/attachments/upload/file/route");

describe("GET /api/chat/attachments/upload/file", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveChatAttachmentAccessIdentityMock.mockResolvedValue({
      usageIdentity: {
        identityKey: "anon-session:test",
      },
    });
    getMock.mockResolvedValue({
      statusCode: 200,
      stream: new Response("hello").body,
      headers: new Headers(),
      blob: {
        contentType: "image/png",
        contentDisposition: 'inline; filename="example.png"',
        etag: '"etag"',
      },
    });
  });

  function createRequest(pathname: string) {
    return {
      nextUrl: {
        searchParams: new URLSearchParams({ pathname }),
      },
      headers: {
        get: jest.fn(() => null),
      },
      cookies: {
        get: jest.fn(),
        getAll: jest.fn(() => []),
      },
    };
  }

  it("denies access when ownership does not match the current chat identity", async () => {
    assertChatAttachmentOwnershipMock.mockRejectedValue(
      new MockChatAttachmentAccessError("denied"),
    );

    const res = await fileRoute.GET(
      createRequest("chat-attachments/example.png") as any,
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Attachment not found",
    });
    expect(getMock).not.toHaveBeenCalled();
  });

  it("streams the blob after ownership verification succeeds", async () => {
    assertChatAttachmentOwnershipMock.mockResolvedValue({
      owner_identity_key: "anon-session:test",
      status: "uploaded",
    });

    const res = await fileRoute.GET(
      createRequest("chat-attachments/example.png") as any,
    );

    expect(assertChatAttachmentOwnershipMock).toHaveBeenCalledWith(
      "chat-attachments/example.png",
      "anon-session:test",
    );
    expect(getMock).toHaveBeenCalledWith("chat-attachments/example.png", {
      access: "private",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });

  it("forwards range requests for partial video streaming", async () => {
    assertChatAttachmentOwnershipMock.mockResolvedValue({
      owner_identity_key: "anon-session:test",
      status: "uploaded",
    });
    getMock.mockResolvedValue({
      statusCode: 200,
      stream: new Response("partial").body,
      headers: new Headers({
        "content-range": "bytes 0-6/100",
        "content-length": "7",
        "accept-ranges": "bytes",
      }),
      blob: {
        contentType: "video/mp4",
        contentDisposition: 'inline; filename="clip.mp4"',
        etag: '"etag"',
      },
    });

    const res = await fileRoute.GET({
      nextUrl: {
        searchParams: new URLSearchParams({
          pathname: "chat-attachments/clip.mp4",
        }),
      },
      headers: {
        get: jest.fn((name: string) =>
          name.toLowerCase() === "range" ? "bytes=0-6" : null,
        ),
      },
      cookies: {
        get: jest.fn(),
        getAll: jest.fn(() => []),
      },
    } as any);

    expect(getMock).toHaveBeenCalledWith("chat-attachments/clip.mp4", {
      access: "private",
      headers: { range: "bytes=0-6" },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-6/100");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
  });
});
