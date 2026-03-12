"use client";

import { useMemo } from "react";
import { chatController } from "@/lib/chat/controller";
import { selectChatCanSend, selectChatHasOnlyWelcomeMessage } from "@/lib/chat/selectors";
import { useChatStore } from "@/lib/chat/store";

export function useChatWidget() {
  const store = useChatStore();

  return useMemo(
    () => ({
      ...store,
      canSend: selectChatCanSend(store),
      showSuggestedPrompts: selectChatHasOnlyWelcomeMessage(store.messages),
      openWidget: async () => {
        store.openWidget();
        await chatController.persistWidgetSession();
      },
      closeWidget: async () => {
        store.closeWidget();
        await chatController.persistWidgetSession();
      },
      dismissPeek: async () => {
        store.dismissPeek();
        await chatController.persistWidgetSession();
      },
      setPeekVisible: async (visible: boolean) => {
        store.setPeekVisible(visible);
        await chatController.persistWidgetSession();
      },
      sendMessage: async (message: string) => {
        await chatController.sendMessage(message);
      },
      clearConversation: async () => {
        await chatController.clearConversation();
      },
      setDraft: async (draft: string) => {
        store.setDraft(draft);
        await chatController.persistWidgetSession();
      },
    }),
    [store],
  );
}
