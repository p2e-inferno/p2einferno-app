import { NextRequest, NextResponse } from "next/server";
import { isChatAttachmentBlobPath } from "@/lib/chat/attachment-serving";
import {
  assertChatAttachmentOwnership,
  deleteChatAttachmentsWithOwnershipCleanup,
  resolveChatAttachmentAccessIdentity,
} from "@/lib/chat/server/attachment-access";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:chat-attachments:cleanup");
const MAX_CLEANUP_PATHNAMES = 20;
const OWNERSHIP_CHECK_BATCH_SIZE = 5;

interface CleanupBody {
  pathnames?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid cleanup payload" },
        { status: 400 },
      );
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Invalid cleanup payload" },
        { status: 400 },
      );
    }

    const typedBody = body as CleanupBody;
    const rawPathnames = Array.isArray(typedBody.pathnames)
      ? typedBody.pathnames
      : [];
    const requestedPathnames = Array.from(
      new Set(
        rawPathnames.filter(
          (value): value is string =>
            typeof value === "string" && isChatAttachmentBlobPath(value),
        ),
      ),
    ).slice(0, MAX_CLEANUP_PATHNAMES);

    if (!requestedPathnames.length) {
      return NextResponse.json({ deletedCount: 0 });
    }

    const identity = await resolveChatAttachmentAccessIdentity(request);
    const verifiedPathnames: string[] = [];

    const redactedIdentityKey = identity.usageIdentity.identityKey.slice(-6);

    for (
      let startIndex = 0;
      startIndex < requestedPathnames.length;
      startIndex += OWNERSHIP_CHECK_BATCH_SIZE
    ) {
      const batch = requestedPathnames.slice(
        startIndex,
        startIndex + OWNERSHIP_CHECK_BATCH_SIZE,
      );

      await Promise.all(
        batch.map(async (pathname) => {
          try {
            await assertChatAttachmentOwnership(
              pathname,
              identity.usageIdentity.identityKey,
            );
            verifiedPathnames.push(pathname);
          } catch (error) {
            log.warn("Skipped chat attachment cleanup for unowned pathname", {
              pathname,
              identityKey: `***${redactedIdentityKey}`,
              error,
            });
          }
        }),
      );
    }

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
