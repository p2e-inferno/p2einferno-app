import { BrowserChatRepository } from "@/lib/chat/repository/browser-chat-repository";
import type { ChatRepository } from "@/lib/chat/repository/chat-repository";
import { SupabaseChatRepository } from "@/lib/chat/repository/supabase-chat-repository";
import type { ChatAuthContext } from "@/lib/chat/types";

export interface ChatSessionPersistence {
  preferredRepository: ChatRepository;
  fallbackRepository: ChatRepository;
}

export function getChatSessionPersistence(
  auth: ChatAuthContext,
  accessToken?: string | null,
): ChatSessionPersistence {
  const hasResolvedAuthenticatedIdentity =
    auth.isAuthenticated && Boolean(auth.privyUserId);
  const fallbackRepository = new BrowserChatRepository({
    authenticated: hasResolvedAuthenticatedIdentity,
    privyUserId: auth.privyUserId,
  });

  if (!auth.isAuthenticated) {
    return {
      preferredRepository: fallbackRepository,
      fallbackRepository,
    };
  }

  const preferredRepository = new SupabaseChatRepository({
    privyUserId: auth.privyUserId,
    accessToken,
  });

  return {
    preferredRepository,
    fallbackRepository,
  };
}
