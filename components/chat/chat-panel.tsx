"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, RotateCcw, X, Loader2 } from "lucide-react";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import { ChatSuggestedPrompts } from "@/components/chat/chat-suggested-prompts";
import type { ChatMessage } from "@/lib/chat/types";

import { ChatTooltip } from "@/components/chat/chat-tooltip";

interface ChatPanelProps {
  open: boolean;
  draft: string;
  messages: ChatMessage[];
  error: string | null;
  loading: boolean;
  showTypingIndicator: boolean;
  showSuggestedPrompts: boolean;
  pageLabel: string;
  onClose: () => Promise<void>;
  onClearConversation: () => Promise<void>;
  onDraftChange: (value: string) => Promise<void>;
  onSendMessage: (
    payload:
      | string
      | { text: string; attachments?: ChatMessage["attachments"] },
  ) => Promise<void>;
  onRetryMessage: (messageId: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
}

export function ChatPanel({
  open,
  draft,
  messages,
  error,
  loading,
  showTypingIndicator,
  showSuggestedPrompts,
  pageLabel,
  onClose,
  onClearConversation,
  onDraftChange,
  onSendMessage,
  onRetryMessage,
  onDeleteMessage,
}: ChatPanelProps) {
  const [isResetting, setIsResetting] = useState(false);

  const handleClearConversation = async () => {
    if (isResetting) return;
    setIsResetting(true);
    try {
      await onClearConversation();
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20, filter: "blur(10px)" }}
          animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, scale: 0.95, y: 20, filter: "blur(10px)" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="absolute bottom-0 right-0 z-50 w-[400px] max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-[2.5rem] border border-white/10 bg-slate-900/95 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
        >
          <div className="flex min-h-0 flex-col">
            {/* Header */}
            <div className="relative z-10 flex items-center justify-between border-b border-white/5 bg-slate-800/40 px-6 py-5 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-tr from-slate-800 to-slate-700 shadow-inner">
                    <Bot className="h-6 w-6 text-primary" />
                  </div>
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-slate-900 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                </div>
                <div>
                  <h3 className="font-heading text-base font-bold uppercase tracking-wide text-white font-orbitron">
                    Infernal AI
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-widest text-emerald-500">
                      Online
                    </span>
                    <span className="text-[10px] text-slate-500">•</span>
                    <span className="text-[10px] text-slate-500">
                      {pageLabel}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <ChatTooltip label="Clear History">
                  <button
                    onClick={() => void handleClearConversation()}
                    disabled={isResetting || messages.length <= 1}
                    className="group p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-all outline-none disabled:opacity-30 disabled:pointer-events-none active:scale-95"
                    aria-label="Clear conversation"
                  >
                    {isResetting ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                  </button>
                </ChatTooltip>

                <ChatTooltip label="Close Chat">
                  <button
                    onClick={() => void onClose()}
                    className="group p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-all outline-none active:scale-95"
                    aria-label="Close chat"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </ChatTooltip>
              </div>
            </div>

            {/* Chat Content */}
            <div className="flex h-[440px] min-h-0 flex-col bg-slate-900/40">
              <div className="min-h-0 flex-1 overflow-hidden">
                {messages.length === 0 && <ChatEmptyState />}
                <ChatMessageList
                  messages={messages}
                  loading={loading}
                  showTypingIndicator={showTypingIndicator}
                  onRetryMessage={onRetryMessage}
                  onDeleteMessage={onDeleteMessage}
                />
              </div>

              {/* Suggestions & Input */}
              <div className="p-6 pt-2">
                {error && (
                  <div className="mb-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    {error}
                  </div>
                )}

                {showSuggestedPrompts && messages.length <= 1 && !loading && (
                  <div className="mb-4 flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <ChatSuggestedPrompts onPromptSelect={onSendMessage} />
                  </div>
                )}

                <div className="relative group">
                  <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-primary/20 to-orange-500/20 blur opacity-0 transition duration-500 group-focus-within:opacity-100" />
                  <div className="relative border-t-0 p-0">
                    <ChatComposer
                      value={draft}
                      disabled={loading}
                      onChange={onDraftChange}
                      onSubmit={(payload) => onSendMessage(payload)}
                    />
                  </div>
                </div>

                {/* <p className="mt-3 text-center text-[10px] font-medium uppercase tracking-widest text-slate-500">
                  Powered by Inferno Intelligence
                </p> */}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
