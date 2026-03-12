import type { ChatAdapter } from "@/lib/chat/adapters/chat-adapter";
import { ensureJsonResponse } from "@/lib/chat/repository/http";
import type { ChatRespondResponseBody } from "@/lib/chat/server/respond-types";
import type { ChatAdapterRequest } from "@/lib/chat/types";

export class HttpChatAdapter implements ChatAdapter {
  async reply(input: ChatAdapterRequest) {
    const response = await fetch("/api/chat/respond", {
      method: "POST",
      headers: this.getHeaders(input.accessToken),
      credentials: "include",
      body: JSON.stringify({
        conversationId: input.conversationId,
        message: input.message.content,
        messages: input.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        route: {
          pathname: input.route?.pathname ?? "/",
          routeKey: input.route?.routeKey ?? "home",
          segment: input.route?.segment ?? null,
          behaviorKey: input.route?.behavior?.key ?? null,
        },
      }),
    });

    const payload = await ensureJsonResponse<ChatRespondResponseBody>(response);
    return {
      mode: "final" as const,
      message: payload.message,
      sources: payload.sources,
    };
  }

  private getHeaders(accessToken?: string | null) {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    return headers;
  }
}

export const httpChatAdapter = new HttpChatAdapter();
