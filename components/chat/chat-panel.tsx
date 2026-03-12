"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bot, RotateCcw, X } from "lucide-react";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import { ChatSuggestedPrompts } from "@/components/chat/chat-suggested-prompts";
import type { ChatMessage } from "@/lib/chat/types";

interface ChatPanelProps {
  open: boolean;
  draft: string;
  messages: ChatMessage[];
  loading: boolean;
  showSuggestedPrompts: boolean;
  pageLabel: string;
  onClose: () => Promise<void>;
  onClearConversation: () => Promise<void>;
  onDraftChange: (value: string) => Promise<void>;
  onSendMessage: (value: string) => Promise<void>;
}

export function ChatPanel({
  open,
  draft,
  messages,
  loading,
  showSuggestedPrompts,
  pageLabel,
  onClose,
  onClearConversation,
  onDraftChange,
  onSendMessage,
}: ChatPanelProps) {
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
            <div className="flex items-center justify-between border-b border-white/5 bg-slate-800/40 px-6 py-5 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-tr from-slate-800 to-slate-700 shadow-inner">
                    <Bot className="h-6 w-6 text-primary" />
                  </div>
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-slate-900 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                </div>
                <div>
                  <h3 className="font-heading text-base font-bold uppercase tracking-wide text-white font-orbitron">
                    Inferno AI
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-widest text-emerald-500">
                      Online
                    </span>
                    <span className="text-[10px] text-slate-500">•</span>
                    <span className="text-[10px] text-slate-500">{pageLabel}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white/50 transition-all hover:bg-white/10 hover:text-white"
                  onClick={() => void onClearConversation()}
                  aria-label="Clear conversation"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white/50 transition-all hover:bg-white/10 hover:text-white"
                  onClick={() => void onClose()}
                  aria-label="Close chat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Chat Content */}
            <div className="flex h-[440px] min-h-0 flex-col bg-slate-900/40">
              <div className="min-h-0 flex-1 overflow-hidden">
                {messages.length === 0 && <ChatEmptyState />}
                <ChatMessageList messages={messages} loading={loading} />
              </div>

              {/* Suggestions & Input */}
              <div className="p-6 pt-2">
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
                      onSubmit={onSendMessage}
                    />
                  </div>
                </div>

                <p className="mt-3 text-center text-[10px] font-medium uppercase tracking-widest text-slate-500">
                  Powered by Inferno Intelligence
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
