import { NextRequest, NextResponse } from "next/server";
import { chatService } from "@/lib/chat/server/chat-service";
import {
  chatRouteBadRequest,
  parseChatRouteJson,
  requireChatRouteUser,
} from "@/lib/chat/server/route-helpers";
import type { ChatConversation } from "@/lib/chat/types";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:chat-conversations");

interface CreateConversationBody {
  conversation?: ChatConversation;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireChatRouteUser(req);
    if (auth.response || !auth.user) {
      return auth.response;
    }

    const parsed = await parseChatRouteJson<CreateConversationBody>(req);
    if (parsed.response || !parsed.body) {
      return parsed.response;
    }

    const body = parsed.body;
    if (!body.conversation) {
      return chatRouteBadRequest("Conversation is required");
    }

    const conversation = await chatService.createConversation(
      auth.user.id,
      body.conversation,
    );
    return NextResponse.json({ conversation });
  } catch (error) {
    log.error("Failed to create chat conversation", { error });
    return NextResponse.json(
      { error: "Unable to create conversation" },
      { status: 500 },
    );
  }
}
