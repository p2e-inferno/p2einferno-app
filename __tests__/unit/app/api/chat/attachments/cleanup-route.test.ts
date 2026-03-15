export {};

const resolveChatAttachmentAccessIdentityMock = jest.fn();
const assertChatAttachmentOwnershipMock = jest.fn();
const deleteChatAttachmentsWithOwnershipCleanupMock = jest.fn();

jest.mock("next/server", () => {
  class MockResponse {
    status: number;
    body: unknown;

    constructor(body: unknown, init: { status?: number } = {}) {
      this.status = init.status ?? 200;
      this.body = body;
    }

    static json(body: unknown, init: { status?: number } = {}) {
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

jest.mock("@/lib/chat/server/attachment-access", () => ({
  assertChatAttachmentOwnership: (...args: any[]) =>
    assertChatAttachmentOwnershipMock(...args),
  deleteChatAttachmentsWithOwnershipCleanup: (...args: any[]) =>
    deleteChatAttachmentsWithOwnershipCleanupMock(...args),
  resolveChatAttachmentAccessIdentity: (...args: any[]) =>
    resolveChatAttachmentAccessIdentityMock(...args),
}));

const cleanupRoute = require("@/app/api/chat/attachments/cleanup/route");

describe("POST /api/chat/attachments/cleanup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveChatAttachmentAccessIdentityMock.mockResolvedValue({
      usageIdentity: {
        identityKey: "anon-session:test",
      },
    });
  });

  it("deletes only pathnames owned by the current chat identity", async () => {
    assertChatAttachmentOwnershipMock.mockImplementation(
      async (pathname: string) => {
        if (pathname === "chat-attachments/owned.png") {
          return {
            owner_identity_key: "anon-session:test",
            status: "uploaded",
          };
        }
        throw new Error("not owned");
      },
    );

    const res = await cleanupRoute.POST({
      json: async () => ({
        pathnames: [
          "chat-attachments/owned.png",
          "chat-attachments/other.png",
          "invalid/path.png",
        ],
      }),
    } as any);

    expect(deleteChatAttachmentsWithOwnershipCleanupMock).toHaveBeenCalledWith([
      "chat-attachments/owned.png",
    ]);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ deletedCount: 1 });
  });
});
