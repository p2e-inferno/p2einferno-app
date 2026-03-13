"use client";

import { useMemo } from "react";
import { chatController } from "@/lib/chat/controller";
import {
  selectChatCanSend,
  selectChatHasOnlyWelcomeMessage,
  selectChatIsBusy,
  selectChatShouldShowTypingIndicator,
} from "@/lib/chat/selectors";
import {
  ChatMessage,
} from "@/lib/chat/types";
import { useChatStore } from "@/lib/chat/store";
import { useChatAuthSession } from "@/hooks/chat/use-chat-auth-session";

export function useChatWidget() {
  const store = useChatStore();
  const { resolveAccessToken } = useChatAuthSession();

  return useMemo(
    () => ({
      ...store,
      canSend: selectChatCanSend(store),
      isBusy: selectChatIsBusy(store),
      showSuggestedPrompts: selectChatHasOnlyWelcomeMessage(store.messages),
      showTypingIndicator: selectChatShouldShowTypingIndicator(store),
      openWidget: async () => {
        store.openWidget();
        await chatController.persistWidgetSession({
          accessToken: await resolveAccessToken(),
        });
      },
      closeWidget: async () => {
        store.closeWidget();
        await chatController.persistWidgetSession({
          accessToken: await resolveAccessToken(),
        });
      },
      dismissPeek: async () => {
        store.dismissPeek();
        await chatController.persistWidgetSession({
          accessToken: await resolveAccessToken(),
        });
      },
      setPeekVisible: async (visible: boolean) => {
        store.setPeekVisible(visible);
      },
      sendMessage: async (
        payload: string | { text: string; attachments?: ChatMessage["attachments"] },
      ) => {
        await chatController.sendMessage(payload, {
          accessToken: await resolveAccessToken(),
        });
      },
      clearConversation: async () => {
        await chatController.clearConversation({
          accessToken: await resolveAccessToken(),
        });
      },
      setDraft: async (draft: string) => {
        store.setDraft(draft);
      },
    }),
    [resolveAccessToken, store],
  );
}
