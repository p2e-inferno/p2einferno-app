jest.mock("@vercel/blob", () => ({
  get: jest.fn(),
}));

const assertChatAttachmentOwnership = jest.fn();

jest.mock("@/lib/chat/server/attachment-access", () => ({
  ChatAttachmentAccessError: class ChatAttachmentAccessError extends Error {},
  assertChatAttachmentOwnership: (...args: unknown[]) =>
    assertChatAttachmentOwnership(...args),
}));

import { get } from "@vercel/blob";
import { resolveChatAttachmentForModel } from "@/lib/chat/server/attachment-content";

const getMock = get as jest.MockedFunction<typeof get>;

describe("resolveChatAttachmentForModel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("leaves data URLs unchanged", async () => {
    const attachment = {
      type: "image" as const,
      data: "data:image/png;base64,Zm9v",
      name: "test.png",
      size: 3,
    };

    await expect(resolveChatAttachmentForModel(attachment)).resolves.toEqual(
      attachment,
    );
    expect(getMock).not.toHaveBeenCalled();
    expect(assertChatAttachmentOwnership).not.toHaveBeenCalled();
  });

  it("resolves proxy URLs through the private blob store", async () => {
    assertChatAttachmentOwnership.mockResolvedValue({
      owner_identity_key: "anon-session:test",
      status: "uploaded",
    });
    getMock.mockResolvedValue({
      statusCode: 200,
      stream: new Response("foo").body,
      headers: new Headers(),
      blob: {
        url: "https://example.private.blob.vercel-storage.com/chat-attachments/test.png",
        downloadUrl:
          "https://example.private.blob.vercel-storage.com/chat-attachments/test.png?download=1",
        pathname: "chat-attachments/test.png",
        contentDisposition: 'inline; filename="test.png"',
        cacheControl: "public, max-age=31536000",
        uploadedAt: new Date(),
        etag: '"etag"',
        contentType: "image/png",
        size: 3,
      },
    } as any);

    await expect(
      resolveChatAttachmentForModel({
        type: "image",
        data: "https://app.example.com/api/chat/attachments/upload/file?pathname=chat-attachments%2Ftest.png",
        name: "test.png",
      }, "anon-session:test"),
    ).resolves.toEqual({
      type: "image",
      data: "data:image/png;base64,Zm9v",
      name: "test.png",
      size: 3,
    });

    expect(assertChatAttachmentOwnership).toHaveBeenCalledWith(
      "chat-attachments/test.png",
      "anon-session:test",
    );
    expect(getMock).toHaveBeenCalledWith("chat-attachments/test.png", {
      access: "private",
    });
  });
});
