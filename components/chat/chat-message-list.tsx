"use client";

import * as React from "react";
import { Bot } from "lucide-react";
import { ChatMessageBubble } from "@/components/chat/chat-message-bubble";
import { ChatTypingIndicator } from "@/components/chat/chat-typing-indicator";
import type { ChatMessage } from "@/lib/chat/types";

interface ChatMessageListProps {
  messages: ChatMessage[];
  loading: boolean;
  showTypingIndicator: boolean;
}

export function ChatMessageList({
  messages,
  loading,
  showTypingIndicator,
}: ChatMessageListProps) {
  const listRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const element = listRef.current;
    if (!element) {
      return;
    }

    requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
  }, [loading, messages.length, showTypingIndicator]);

  return (
    <div
      ref={listRef}
      className="scrollbar-hide flex h-full min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4"
    >
      {messages.map((message) => (
        <ChatMessageBubble key={message.id} message={message} />
      ))}

      {showTypingIndicator && (
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/5 bg-slate-800">
            <Bot className="h-4 w-4 text-primary/70" />
          </div>
          {/* When real streaming arrives, replace this placeholder once an in-list assistant bubble is actively rendering partial content. */}
          <div className="rounded-[1.2rem] rounded-tl-none border border-white/5 bg-slate-800/50 px-4 py-3">
            <ChatTypingIndicator />
          </div>
        </div>
      )}
    </div>
  );
}
