import {
  buildChatAttachmentBlobPath,
  buildChatAttachmentProxyPath,
  buildChatAttachmentProxyUrl,
  extractChatAttachmentBlobPath,
  isChatAttachmentBlobPath,
} from "@/lib/chat/attachment-serving";

describe("chat attachment serving", () => {
  it("namespaces chat uploads under the chat attachment prefix", () => {
    expect(buildChatAttachmentBlobPath("example.png")).toBe(
      "chat-attachments/example.png",
    );
  });

  it("builds proxy URLs for served attachments", () => {
    expect(
      buildChatAttachmentProxyPath("chat-attachments/example.png"),
    ).toBe(
      "/api/chat/attachments/upload/file?pathname=chat-attachments%2Fexample.png",
    );

    expect(
      buildChatAttachmentProxyUrl(
        "chat-attachments/example.png",
        "https://app.example.com",
      ),
    ).toBe(
      "https://app.example.com/api/chat/attachments/upload/file?pathname=chat-attachments%2Fexample.png",
    );
  });

  it("extracts the underlying blob pathname from proxy URLs", () => {
    expect(
      extractChatAttachmentBlobPath(
        "https://app.example.com/api/chat/attachments/upload/file?pathname=chat-attachments%2Fexample.png",
      ),
    ).toBe("chat-attachments/example.png");
  });

  it("extracts the underlying blob pathname from direct blob URLs", () => {
    expect(
      extractChatAttachmentBlobPath(
        "https://example.private.blob.vercel-storage.com/chat-attachments/example.png?download=1",
      ),
    ).toBe("chat-attachments/example.png");
  });

  it("accepts raw chat attachment pathnames", () => {
    expect(extractChatAttachmentBlobPath("chat-attachments/example.png")).toBe(
      "chat-attachments/example.png",
    );
  });

  it("rejects non-chat attachment paths", () => {
    expect(isChatAttachmentBlobPath("chat-attachments/example.png")).toBe(true);
    expect(isChatAttachmentBlobPath("other/example.png")).toBe(false);
    expect(
      extractChatAttachmentBlobPath(
        "https://app.example.com/api/chat/attachments/upload/file?pathname=other%2Fexample.png",
      ),
    ).toBeNull();
  });
});
