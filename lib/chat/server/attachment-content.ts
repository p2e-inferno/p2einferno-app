import { get } from "@vercel/blob";
import type { ChatAttachment } from "@/lib/chat/types";
import { extractChatAttachmentBlobPath } from "@/lib/chat/attachment-serving";
import {
  ChatAttachmentAccessError,
  assertChatAttachmentOwnership,
} from "@/lib/chat/server/attachment-access";

function isDataUrl(value: string) {
  return value.startsWith("data:");
}

export async function resolveChatAttachmentForModel(
  attachment: ChatAttachment,
  ownerIdentityKey?: string,
): Promise<ChatAttachment> {
  if (isDataUrl(attachment.data)) {
    return attachment;
  }

  const blobPath = extractChatAttachmentBlobPath(attachment.data);
  if (!blobPath) {
    return attachment;
  }

  if (!ownerIdentityKey) {
    throw new ChatAttachmentAccessError();
  }

  await assertChatAttachmentOwnership(blobPath, ownerIdentityKey);

  const result = await get(blobPath, {
    access: "private",
  });

  if (!result || result.statusCode !== 200 || !result.stream) {
    return attachment;
  }

  const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
  const contentType =
    result.blob.contentType ||
    (attachment.type === "video" ? "video/mp4" : "image/png");

  return {
    ...attachment,
    data: `data:${contentType};base64,${buffer.toString("base64")}`,
    size: attachment.size ?? result.blob.size,
  };
}

export async function resolveChatAttachmentsForModel(
  attachments?: ChatAttachment[],
  ownerIdentityKey?: string,
) {
  if (!attachments?.length) {
    return [];
  }

  return Promise.all(
    attachments.map((attachment) =>
      resolveChatAttachmentForModel(attachment, ownerIdentityKey),
    ),
  );
}
