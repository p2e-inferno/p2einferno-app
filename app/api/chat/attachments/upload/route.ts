import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import {
  getChatAttachmentCallbackUrl,
  getChatAttachmentUploadConstraints,
} from "@/lib/chat/blob-upload-config";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:chat-attachments:upload");

interface UploadClientPayload {
  attachmentId?: string;
  fileName?: string;
  clientStartedAt?: number;
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const callbackUrl = getChatAttachmentCallbackUrl(request.url);
    const uploadConstraints = getChatAttachmentUploadConstraints();

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (
        pathname: string,
        clientPayload,
      ) => {
        let parsedClientPayload: UploadClientPayload | null = null;
        if (clientPayload) {
          try {
            parsedClientPayload = JSON.parse(clientPayload) as UploadClientPayload;
          } catch {}
        }
        log.debug("generating blob upload token", {
          pathname,
          callbackUrl,
          clientPayload: parsedClientPayload,
        });
        return {
          ...uploadConstraints,
          ...(callbackUrl ? { callbackUrl } : {}),
          tokenPayload: clientPayload,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let parsedTokenPayload: UploadClientPayload | null = null;
        if (tokenPayload) {
          try {
            parsedTokenPayload = JSON.parse(tokenPayload) as UploadClientPayload;
          } catch {}
        }
        log.info("blob upload completion received", {
          blobUrl: blob.url,
          pathname: blob.pathname,
          attachmentId: parsedTokenPayload?.attachmentId ?? null,
          fileName: parsedTokenPayload?.fileName ?? null,
          elapsedSinceClientStartMs:
            typeof parsedTokenPayload?.clientStartedAt === "number"
              ? Date.now() - parsedTokenPayload.clientStartedAt
              : null,
        });
        // Add any server-side logic here (e.g. database updates)
      },
    });

    log.debug("blob upload token generated successfully");
    return NextResponse.json(jsonResponse);
  } catch (error) {
    log.error("blob upload handler failed", { error });
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
