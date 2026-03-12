import { NextRequest, NextResponse } from "next/server";
import { chatService } from "@/lib/chat/server/chat-service";
import {
  chatRouteBadRequest,
  parseChatRouteJson,
  requireChatRouteUser,
} from "@/lib/chat/server/route-helpers";
import type { ChatWidgetSession } from "@/lib/chat/types";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:chat-session");

interface SaveWidgetBody {
  widget?: ChatWidgetSession;
}

export async function GET(req: NextRequest) {
  try {
    const { user, response } = await requireChatRouteUser(req);
    if (response || !user) {
      return response;
    }

    const payload = await chatService.restoreActiveConversation(user.id);
    return NextResponse.json(payload);
  } catch (error) {
    log.error("Failed to restore chat session", { error });
    return NextResponse.json(
      { error: "Unable to restore chat session" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireChatRouteUser(req);
    if (auth.response || !auth.user) {
      return auth.response;
    }

    const parsed = await parseChatRouteJson<SaveWidgetBody>(req);
    if (parsed.response || !parsed.body) {
      return parsed.response;
    }

    const body = parsed.body;
    if (!body.widget) {
      return chatRouteBadRequest("Widget session is required");
    }

    await chatService.saveWidgetSession(auth.user.id, body.widget);
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error("Failed to save chat widget session", { error });
    return NextResponse.json(
      { error: "Unable to save chat widget session" },
      { status: 500 },
    );
  }
}
