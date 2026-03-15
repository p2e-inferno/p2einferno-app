import { NextRequest, NextResponse } from "next/server";
import { isChatAttachmentBlobPath } from "@/lib/chat/attachment-serving";
import {
  assertChatAttachmentOwnership,
  deleteChatAttachmentsWithOwnershipCleanup,
  resolveChatAttachmentAccessIdentity,
} from "@/lib/chat/server/attachment-access";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:chat-attachments:cleanup");

interface CleanupBody {
  pathnames?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CleanupBody;
    const rawPathnames = Array.isArray(body.pathnames) ? body.pathnames : [];
    const requestedPathnames = Array.from(
      new Set(
        rawPathnames.filter(
          (value): value is string =>
            typeof value === "string" && isChatAttachmentBlobPath(value),
        ),
      ),
    );

    if (!requestedPathnames.length) {
      return NextResponse.json({ deletedCount: 0 });
    }

    const identity = await resolveChatAttachmentAccessIdentity(request);
    const verifiedPathnames: string[] = [];

    await Promise.all(
      requestedPathnames.map(async (pathname) => {
        try {
          await assertChatAttachmentOwnership(
            pathname,
            identity.usageIdentity.identityKey,
          );
          verifiedPathnames.push(pathname);
        } catch (error) {
          log.warn("Skipped chat attachment cleanup for unowned pathname", {
            pathname,
            identityKey: identity.usageIdentity.identityKey,
            error,
          });
        }
      }),
    );

    if (!verifiedPathnames.length) {
      return NextResponse.json({ deletedCount: 0 });
    }

    await deleteChatAttachmentsWithOwnershipCleanup(verifiedPathnames);

    return NextResponse.json({ deletedCount: verifiedPathnames.length });
  } catch (error) {
    log.error("Failed to clean up chat attachments", { error });
    return NextResponse.json(
      { error: "Unable to clean up chat attachments" },
      { status: 500 },
    );
  }
}
