import type { KnowledgeAudience } from "@/lib/ai/knowledge/types";
import type { ChatMessage, ChatSourceReference } from "@/lib/chat/types";

export type ServerChatRouteProfileId =
  | "home_sales"
  | "general_support"
  | "lobby_support"
  | "quest_support"
  | "bootcamp_support"
  | "vendor_support";

export type ChatRespondUsageTier = "anonymous" | "authenticated" | "member";

export interface ChatRespondRouteInput {
  pathname: string;
  routeKey: string;
  segment?: string | null;
  behaviorKey?: string | null;
}

export interface ChatRespondRequestBody {
  conversationId: string;
  message: string;
  messages: Array<Pick<ChatMessage, "role" | "content">>;
  route: ChatRespondRouteInput;
}

export interface ChatRespondResponseBody {
  message: ChatMessage;
  sources: ChatSourceReference[];
  retrievalMeta?: {
    profile: ServerChatRouteProfileId;
    audience: KnowledgeAudience[];
    domainTags: string[];
    resultCount: number;
  };
}

export interface ServerChatRouteProfile {
  id: ServerChatRouteProfileId;
  audience: KnowledgeAudience[];
  domainTags: string[];
  retrievalLimit: number;
  freshnessDays?: number;
  maxTokens?: number;
  assistantObjective: string;
  responseStyle: string;
  weakRetrievalMode: "sales" | "support";
  weakRetrievalReply: string;
}
