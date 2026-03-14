import {
  getChatAttachmentCallbackUrl,
  getChatAttachmentHandleUploadUrl,
  getChatAttachmentUploadConstraints,
} from "@/lib/chat/blob-upload-config";

describe("chat blob upload config", () => {
  const previousCallbackUrl = process.env.VERCEL_BLOB_CALLBACK_URL;

  afterEach(() => {
    if (previousCallbackUrl === undefined) {
      delete process.env.VERCEL_BLOB_CALLBACK_URL;
      return;
    }

    process.env.VERCEL_BLOB_CALLBACK_URL = previousCallbackUrl;
  });

  it("uses a relative route for client-side token generation", () => {
    expect(getChatAttachmentHandleUploadUrl()).toBe(
      "/api/chat/attachments/upload",
    );
  });

  it("prefers the explicit blob callback env when present", () => {
    process.env.VERCEL_BLOB_CALLBACK_URL = "https://abc123.ngrok-free.app/";

    expect(
      getChatAttachmentCallbackUrl("http://localhost:3000/api/chat/attachments/upload"),
    ).toBe("https://abc123.ngrok-free.app/api/chat/attachments/upload");
  });

  it("uses the request origin when the request is already on a public host", () => {
    delete process.env.VERCEL_BLOB_CALLBACK_URL;

    expect(
      getChatAttachmentCallbackUrl(
        "https://shareice-worthwhile-genealogically.ngrok-free.dev/api/chat/attachments/upload",
      ),
    ).toBe(
      "https://shareice-worthwhile-genealogically.ngrok-free.dev/api/chat/attachments/upload",
    );
  });

  it("omits the callback URL for localhost requests without an override", () => {
    delete process.env.VERCEL_BLOB_CALLBACK_URL;

    expect(
      getChatAttachmentCallbackUrl(
        "http://localhost:3000/api/chat/attachments/upload",
      ),
    ).toBeUndefined();
  });

  it("keeps server-side constraints aligned with chat attachment limits", () => {
    expect(getChatAttachmentUploadConstraints()).toEqual({
      allowedContentTypes: [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/jpg",
        "video/mp4",
        "video/quicktime",
        "video/webm",
      ],
      maximumSizeInBytes: 5 * 1024 * 1024,
    });
  });
});
