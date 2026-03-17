import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import {
  getChatAttachmentCallbackUrl,
  getChatAttachmentUploadConstraints,
} from "@/lib/chat/blob-upload-config";
import { isChatAttachmentBlobPath } from "@/lib/chat/attachment-serving";
import {
  applyChatAnonymousSessionCookie,
  enforceChatAttachmentUploadLimits,
  isTrustedChatAttachmentOrigin,
  markChatAttachmentUploaded,
  persistChatAttachmentOwnership,
  resolveChatAttachmentAccessIdentity,
} from "@/lib/chat/server/attachment-access";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:chat-attachments:upload");

interface UploadClientPayload {
  attachmentId?: string;
  fileName?: string;
  clientStartedAt?: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const isGenerateTokenEvent = body.type === "blob.generate-client-token";
    const identity = isGenerateTokenEvent
      ? await resolveChatAttachmentAccessIdentity(request)
      : null;

    if (isGenerateTokenEvent && !isTrustedChatAttachmentOrigin(request)) {
      return NextResponse.json(
        { error: "Untrusted upload origin" },
        { status: 403 },
      );
    }

    if (identity) {
      const limit = await enforceChatAttachmentUploadLimits(identity);

      if (!limit.allowed) {
        const response = NextResponse.json(
          {
            error: limit.error ?? "Too many attachment uploads",
            reason: limit.reason ?? "quota",
          },
          {
            status: limit.status ?? 429,
            headers: limit.retryAfterSeconds
              ? { "Retry-After": `${limit.retryAfterSeconds}` }
              : undefined,
          },
        );
        return applyChatAnonymousSessionCookie(response, identity);
      }
    }

    const callbackUrl = getChatAttachmentCallbackUrl(request.url);
    const uploadConstraints = getChatAttachmentUploadConstraints();

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (
        pathname: string,
        clientPayload,
      ) => {
        if (!identity) {
          throw new Error("Missing chat attachment identity");
        }

        if (!isChatAttachmentBlobPath(pathname)) {
          throw new Error("Invalid chat attachment pathname");
        }

        let parsedClientPayload: UploadClientPayload | null = null;
        if (clientPayload) {
          try {
            parsedClientPayload = JSON.parse(clientPayload) as UploadClientPayload;
          } catch {}
        }

        await persistChatAttachmentOwnership({
          pathname,
          identity,
        });

        const tokenPayload = JSON.stringify({
          attachmentId: parsedClientPayload?.attachmentId ?? null,
          fileName: parsedClientPayload?.fileName ?? null,
          clientStartedAt: parsedClientPayload?.clientStartedAt ?? null,
          ownerIdentityKey: identity.usageIdentity.identityKey,
        });

        log.debug("generating blob upload token", {
          pathname,
          callbackUrl,
          clientPayload: parsedClientPayload,
          ownerIdentityKey: identity.usageIdentity.identityKey,
        });
        return {
          ...uploadConstraints,
          ...(callbackUrl ? { callbackUrl } : {}),
          tokenPayload,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let parsedTokenPayload:
          | (UploadClientPayload & { ownerIdentityKey?: string | null })
          | null = null;
        if (tokenPayload) {
          try {
            parsedTokenPayload = JSON.parse(tokenPayload) as UploadClientPayload & {
              ownerIdentityKey?: string | null;
            };
          } catch {}
        }
        await markChatAttachmentUploaded(blob.pathname);
        log.info("blob upload completion received", {
          blobUrl: blob.url,
          pathname: blob.pathname,
          attachmentId: parsedTokenPayload?.attachmentId ?? null,
          fileName: parsedTokenPayload?.fileName ?? null,
          ownerIdentityKey: parsedTokenPayload?.ownerIdentityKey ?? null,
          elapsedSinceClientStartMs:
            typeof parsedTokenPayload?.clientStartedAt === "number"
              ? Date.now() - parsedTokenPayload.clientStartedAt
              : null,
        });
        // Add any server-side logic here (e.g. database updates)
      },
    });

    log.debug("blob upload token generated successfully");
    const response = NextResponse.json(jsonResponse);
    return identity
      ? applyChatAnonymousSessionCookie(response, identity)
      : response;
  } catch (error) {
    log.error("blob upload handler failed", { error });
    const message =
      error instanceof Error &&
      (error.message === "Missing chat attachment identity" ||
        error.message === "Invalid chat attachment pathname")
        ? error.message
        : "Unable to process attachment upload";
    const status =
      error instanceof Error &&
      (error.message === "Missing chat attachment identity" ||
        error.message === "Invalid chat attachment pathname")
        ? 400
        : 500;
    return NextResponse.json(
      { error: message },
      { status },
    );
  }
}
