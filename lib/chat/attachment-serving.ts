import {
  CHAT_ATTACHMENT_BLOB_PREFIX,
  CHAT_ATTACHMENT_UPLOAD_ROUTE,
} from "./constants";

const CHAT_ATTACHMENT_FILE_ROUTE = `${CHAT_ATTACHMENT_UPLOAD_ROUTE}/file`;

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

export function buildChatAttachmentBlobPath(filename: string) {
  return `${CHAT_ATTACHMENT_BLOB_PREFIX}/${filename}`;
}

export function isChatAttachmentBlobPath(pathname: string) {
  return pathname.startsWith(`${CHAT_ATTACHMENT_BLOB_PREFIX}/`);
}

export function buildChatAttachmentProxyPath(pathname: string) {
  const params = new URLSearchParams({ pathname });
  return `${CHAT_ATTACHMENT_FILE_ROUTE}?${params.toString()}`;
}

export function buildChatAttachmentProxyUrl(
  pathname: string,
  origin?: string | null,
) {
  const proxyPath = buildChatAttachmentProxyPath(pathname);
  const normalizedOrigin = normalizeOrigin(origin);

  if (!normalizedOrigin) {
    return proxyPath;
  }

  return `${normalizedOrigin}${proxyPath}`;
}

export function extractChatAttachmentBlobPath(value: string) {
  if (!value) {
    return null;
  }

  if (isChatAttachmentBlobPath(value)) {
    return value;
  }

  try {
    const parsed = new URL(value, "http://local.test");
    if (parsed.pathname === CHAT_ATTACHMENT_FILE_ROUTE) {
      const pathname = parsed.searchParams.get("pathname");
      if (!pathname || !isChatAttachmentBlobPath(pathname)) {
        return null;
      }

      return pathname;
    }

    const normalizedPathname = parsed.pathname.replace(/^\/+/, "");
    if (isChatAttachmentBlobPath(normalizedPathname)) {
      return normalizedPathname;
    }
  } catch {
    return null;
  }

  return null;
}
