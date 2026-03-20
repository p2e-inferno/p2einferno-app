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
    error,
    isBusy,
    rateLimitedUntil,
    route,
    showSuggestedPrompts,
    showTypingIndicator,
    openWidget,
    closeWidget,
    dismissPeek,
    clearConversation,
    sendMessage,
    setDraft,
    retryMessage,
    deleteMessage,
  } = useChatWidget();

  return (
    <div className="fixed bottom-3 right-3 z-50 h-16 w-16 max-w-[calc(100vw-1.5rem)] sm:bottom-5 sm:right-5 sm:w-auto">
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
        error={error}
        loading={isBusy}
        showTypingIndicator={showTypingIndicator}
        showSuggestedPrompts={showSuggestedPrompts}
        pageLabel={route?.pageLabel ?? "this page"}
        onClose={closeWidget}
        onClearConversation={clearConversation}
        onDraftChange={setDraft}
        onSendMessage={sendMessage}
        onRetryMessage={retryMessage}
        onDeleteMessage={deleteMessage}
      />

      {!isOpen && (
        <ChatLauncher onOpen={openWidget} rateLimitedUntil={rateLimitedUntil} />
      )}
    </div>
  );
}
