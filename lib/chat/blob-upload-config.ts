import {
  CHAT_ATTACHMENT_LIMITS,
  CHAT_ATTACHMENT_UPLOAD_ROUTE,
} from "./constants";

const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

function normalizeOrigin(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function getChatAttachmentHandleUploadUrl() {
  return CHAT_ATTACHMENT_UPLOAD_ROUTE;
}

export function getChatAttachmentCallbackUrl(requestUrl?: string) {
  const configuredOrigin = normalizeOrigin(process.env.VERCEL_BLOB_CALLBACK_URL);
  if (configuredOrigin) {
    return `${configuredOrigin}${CHAT_ATTACHMENT_UPLOAD_ROUTE}`;
  }

  const requestOrigin = normalizeOrigin(requestUrl);
  if (!requestOrigin) {
    return undefined;
  }

  const { hostname } = new URL(requestOrigin);
  if (LOCALHOST_HOSTNAMES.has(hostname)) {
    return undefined;
  }

  return `${requestOrigin}${CHAT_ATTACHMENT_UPLOAD_ROUTE}`;
}

export function getChatAttachmentUploadConstraints() {
  return {
    allowedContentTypes: [...CHAT_ATTACHMENT_LIMITS.allowedTypes],
    maximumSizeInBytes: CHAT_ATTACHMENT_LIMITS.maxSize,
  };
}
