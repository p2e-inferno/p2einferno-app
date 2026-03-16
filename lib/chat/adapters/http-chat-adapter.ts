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
        attachments: input.message.attachments,
        messages: input.messages
          .filter((message) => message.status !== "error")
          // Drop ghost messages: image-only turns whose attachment data was lost
          // when the conversation was restored from the server (attachments are not
          // persisted to the DB). Sending these causes server validation failures
          // because the message has neither content nor attachments.
          .filter((message) => message.content.trim() || (message.attachments?.length ?? 0) > 0)
          .map((message) => ({
            role: message.role,
            content: message.content,
            attachments: message.attachments,
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
