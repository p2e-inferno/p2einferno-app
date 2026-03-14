import { NextRequest, NextResponse } from "next/server";
import { chatService } from "@/lib/chat/server/chat-service";
import {
  requireChatRouteUser,
} from "@/lib/chat/server/route-helpers";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:chat-conversation-message-delete");

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string; messageId: string }> },
) {
  try {
    const auth = await requireChatRouteUser(req);
    if (auth.response || !auth.user) {
      return auth.response;
    }

    const { conversationId, messageId } = await params;

    await chatService.removeMessage(
      auth.user.id,
      conversationId,
      messageId,
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error("Failed to delete chat message", { error });
    return NextResponse.json(
      { error: "Unable to delete chat message" },
      { status: 500 },
    );
  }
}
