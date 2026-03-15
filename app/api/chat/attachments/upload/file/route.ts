import { get } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { isChatAttachmentBlobPath } from "@/lib/chat/attachment-serving";
import {
  ChatAttachmentAccessError,
  assertChatAttachmentOwnership,
  resolveChatAttachmentAccessIdentity,
} from "@/lib/chat/server/attachment-access";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:chat-attachments:file");

export async function GET(request: NextRequest) {
  const pathname = request.nextUrl.searchParams.get("pathname");

  if (!pathname || !isChatAttachmentBlobPath(pathname)) {
    return NextResponse.json(
      { error: "Invalid attachment pathname" },
      { status: 400 },
    );
  }

  try {
    const identity = await resolveChatAttachmentAccessIdentity(request);
    await assertChatAttachmentOwnership(
      pathname,
      identity.usageIdentity.identityKey,
    );

    const range = request.headers.get("range");
    const ifNoneMatch = request.headers.get("if-none-match") ?? undefined;
    const result = await get(pathname, {
      access: "private",
      ...(ifNoneMatch ? { ifNoneMatch } : {}),
      ...(range ? { headers: { range } } : {}),
    });

    if (!result || result.statusCode !== 200 || !result.stream) {
      if (result?.statusCode === 304) {
        return new NextResponse(null, {
          status: 304,
          headers: {
            ETag: result.blob.etag,
            "Cache-Control": "private, max-age=60",
          },
        });
      }

      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 },
      );
    }

    const contentLength = result.headers.get("content-length");
    const contentRange = result.headers.get("content-range");
    const acceptRanges = result.headers.get("accept-ranges");

    return new NextResponse(result.stream, {
      status: contentRange ? 206 : 200,
      headers: {
        "Content-Type": result.blob.contentType,
        "Content-Disposition": result.blob.contentDisposition,
        "Cache-Control": "private, max-age=60",
        ETag: result.blob.etag,
        ...(contentLength ? { "Content-Length": contentLength } : {}),
        ...(contentRange ? { "Content-Range": contentRange } : {}),
        ...(acceptRanges ? { "Accept-Ranges": acceptRanges } : {}),
      },
    });
  } catch (error) {
    if (error instanceof ChatAttachmentAccessError) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 },
      );
    }

    log.error("Failed to fetch private chat attachment", {
      pathname,
      error,
    });
    return NextResponse.json(
      { error: "Unable to load attachment" },
      { status: 500 },
    );
  }
}
