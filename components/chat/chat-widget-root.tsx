"use client";

import { ChatLauncher } from "@/components/chat/chat-launcher";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ChatTeaser } from "@/components/chat/chat-teaser";
import { useChatBootstrap } from "@/hooks/chat/use-chat-bootstrap";
import { useChatWidget } from "@/hooks/chat/use-chat-widget";

export function ChatWidgetRoot() {
  useChatBootstrap();

  const {
    isOpen,
    isPeekVisible,
    isPeekDismissed,
    draft,
    messages,
    status,
    route,
    showSuggestedPrompts,
    openWidget,
    closeWidget,
    dismissPeek,
    clearConversation,
    sendMessage,
    setDraft,
  } = useChatWidget();

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-[calc(100vw-1.5rem)]">
      <ChatTeaser
        open={isOpen}
        visible={isPeekVisible}
        dismissed={isPeekDismissed}
        onOpen={openWidget}
        onDismiss={dismissPeek}
      />

      <ChatPanel
        open={isOpen}
        draft={draft}
        messages={messages}
        loading={status === "sending" || status === "hydrating"}
        showSuggestedPrompts={showSuggestedPrompts}
        pageLabel={route?.pageLabel ?? "this page"}
        onClose={closeWidget}
        onClearConversation={clearConversation}
        onDraftChange={setDraft}
        onSendMessage={sendMessage}
      />

      {!isOpen && <ChatLauncher onOpen={openWidget} />}
    </div>
  );
}
