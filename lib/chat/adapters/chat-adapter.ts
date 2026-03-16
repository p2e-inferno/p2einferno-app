import type { ChatAdapterRequest, ChatAdapterResponse } from "@/lib/chat/types";

export interface ChatAdapter {
  reply(input: ChatAdapterRequest): Promise<ChatAdapterResponse>;
}
