import { CHAT_ATTACHMENT_LIMITS } from "./constants";
import type { ChatAttachment } from "./types";

export interface AttachmentValidationResult {
  isValid: boolean;
  error?: string;
}

const DATA_URL_PATTERN = /^data:((?:image|video)\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i;

function estimateBase64DecodedBytes(base64Payload: string) {
  const normalized = base64Payload.replace(/\s+/g, "");
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

function parseAttachmentDataUrl(data: string) {
  const match = DATA_URL_PATTERN.exec(data);

  if (!match) {
    return null;
  }

  const mimeType = match[1]?.toLowerCase() ?? "";
  const base64Payload = match[2] ?? "";

  return {
    mimeType,
    decodedBytes: estimateBase64DecodedBytes(base64Payload),
  };
}

/**
 * Validates a file against chat attachment constraints
 * @param file - The file to validate
 * @param currentCount - Number of attachments already in the composer
 * @returns Validation result with isValid flag and optional error message
 */
export function validateChatAttachment(
  file: File,
  currentCount: number,
): AttachmentValidationResult {
  // 1. Check total count
  if (currentCount >= CHAT_ATTACHMENT_LIMITS.maxCount) {
    return {
      isValid: false,
      error: `Maximum of ${CHAT_ATTACHMENT_LIMITS.maxCount} images allowed per request.`,
    };
  }

  // 2. Check file type
  if (!CHAT_ATTACHMENT_LIMITS.allowedTypes.includes(file.type as any)) {
    return {
      isValid: false,
      error: "Invalid file type. Supported types: JPG, PNG, WEBP, and Video (MP4, MOV, WEBM).",
    };
  }

  // 3. Check file size
  if (file.size > CHAT_ATTACHMENT_LIMITS.maxSize) {
    const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
    const maxSizeMB = (CHAT_ATTACHMENT_LIMITS.maxSize / 1024 / 1024).toFixed(0);
    return {
      isValid: false,
      error: `Image size exceeds ${maxSizeMB}MB limit. Your file is ${fileSizeMB}MB.`,
    };
  }

  return { isValid: true };
}

export function validateChatAttachmentPayload(
  attachment: ChatAttachment,
  currentCount: number,
): AttachmentValidationResult {
  if (currentCount >= CHAT_ATTACHMENT_LIMITS.maxCount) {
    return {
      isValid: false,
      error: `Maximum of ${CHAT_ATTACHMENT_LIMITS.maxCount} images allowed per request.`,
    };
  }

  if (attachment.type !== "image" && attachment.type !== "video") {
    return {
      isValid: false,
      error: "Only image and video attachments are supported.",
    };
  }

  if (typeof attachment.data !== "string" || !attachment.data.trim()) {
    return {
      isValid: false,
      error: "Attachment data is required.",
    };
  }

  if (
    attachment.name &&
    attachment.name.length > CHAT_ATTACHMENT_LIMITS.maxNameLength
  ) {
    return {
      isValid: false,
      error: `Attachment names must be under ${CHAT_ATTACHMENT_LIMITS.maxNameLength} characters.`,
    };
  }

  const parsed = parseAttachmentDataUrl(attachment.data);
  if (!parsed) {
    return {
      isValid: false,
      error: "Attachments must be base64-encoded image or video data URLs.",
    };
  }

  if (!CHAT_ATTACHMENT_LIMITS.allowedTypes.includes(parsed.mimeType as any)) {
    return {
      isValid: false,
      error: "Invalid file type. Supported types: JPG, PNG, WEBP, and Video (MP4, MOV, WEBM).",
    };
  }

  if (parsed.decodedBytes > CHAT_ATTACHMENT_LIMITS.maxSize) {
    const fileSizeMB = (parsed.decodedBytes / 1024 / 1024).toFixed(2);
    const maxSizeMB = (CHAT_ATTACHMENT_LIMITS.maxSize / 1024 / 1024).toFixed(0);
    return {
      isValid: false,
      error: `Image size exceeds ${maxSizeMB}MB limit. Your file is ${fileSizeMB}MB.`,
    };
  }

  if (
    typeof attachment.size === "number" &&
    attachment.size > CHAT_ATTACHMENT_LIMITS.maxSize
  ) {
    const fileSizeMB = (attachment.size / 1024 / 1024).toFixed(2);
    const maxSizeMB = (CHAT_ATTACHMENT_LIMITS.maxSize / 1024 / 1024).toFixed(0);
    return {
      isValid: false,
      error: `Image size exceeds ${maxSizeMB}MB limit. Your file is ${fileSizeMB}MB.`,
    };
  }

  return { isValid: true };
}

export function getChatAttachmentPayloadSize(
  attachments: ChatAttachment[],
): number {
  return attachments.reduce((total, attachment) => {
    const parsed = parseAttachmentDataUrl(attachment.data);
    return total + (parsed?.decodedBytes ?? 0);
  }, 0);
}
