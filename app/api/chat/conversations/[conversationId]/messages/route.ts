import { NextRequest, NextResponse } from "next/server";
import { chatService } from "@/lib/chat/server/chat-service";
import {
  chatRouteBadRequest,
  parseChatRouteJson,
  requireChatRouteUser,
} from "@/lib/chat/server/route-helpers";
import type { ChatMessage } from "@/lib/chat/types";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:chat-conversation-messages");

interface AppendMessagesBody {
  messages?: ChatMessage[];
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  try {
    const auth = await requireChatRouteUser(req);
    if (auth.response || !auth.user) {
      return auth.response;
    }

    const { conversationId } = await params;
    const parsed = await parseChatRouteJson<AppendMessagesBody>(req);
    if (parsed.response || !parsed.body) {
      return parsed.response;
    }

    const body = parsed.body;

    if (!Array.isArray(body.messages)) {
      return chatRouteBadRequest("Messages are required");
    }

    const conversation = await chatService.appendMessages(
      auth.user.id,
      conversationId,
      body.messages,
    );

    return NextResponse.json({ conversation });
  } catch (error) {
    log.error("Failed to append chat messages", { error });
    return NextResponse.json(
      { error: "Unable to append chat messages" },
      { status: 500 },
    );
  }
}
