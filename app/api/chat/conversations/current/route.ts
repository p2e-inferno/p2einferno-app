import { NextRequest, NextResponse } from "next/server";
import { chatService } from "@/lib/chat/server/chat-service";
import { requireChatRouteUser } from "@/lib/chat/server/route-helpers";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:chat-current-conversation");

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireChatRouteUser(req);
    if (auth.response || !auth.user) {
      return auth.response;
    }

    const conversationId = req.nextUrl.searchParams.get("conversationId");
    await chatService.clearConversation(auth.user.id, conversationId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error("Failed to clear chat conversation", { error });
    return NextResponse.json(
      { error: "Unable to clear conversation" },
      { status: 500 },
    );
  }
}
