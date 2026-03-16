export function canSubmitChatComposer(params: {
  text: string;
  attachments: Array<{ status: "uploading" | "ready" | "error" }>;
  disabled: boolean;
}) {
  if (params.disabled) {
    return false;
  }

  const hasText = params.text.trim().length > 0;
  const hasReadyAttachments = params.attachments.some(
    (attachment) => attachment.status === "ready",
  );
  const hasUploadingAttachments = params.attachments.some(
    (attachment) => attachment.status === "uploading",
  );

  if (hasUploadingAttachments) {
    return false;
  }

  return hasText || hasReadyAttachments;
}
