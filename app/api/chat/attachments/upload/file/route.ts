import { get } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { isChatAttachmentBlobPath } from "@/lib/chat/attachment-serving";
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
    const result = await get(pathname, {
      access: "private",
    });

    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 },
      );
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType,
        "Content-Disposition": result.blob.contentDisposition,
        "Cache-Control": "private, max-age=60",
        ETag: result.blob.etag,
      },
    });
  } catch (error) {
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
