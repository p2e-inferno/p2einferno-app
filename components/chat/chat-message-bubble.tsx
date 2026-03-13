"use client";

import { motion } from "framer-motion";
import { formatChatTime } from "@/lib/chat/utils";
import type { ChatMessage } from "@/lib/chat/types";

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

export function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex w-full group ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`flex max-w-[85%] flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}
      >
        <div
          className={`relative px-4 py-3 text-sm leading-relaxed shadow-sm transition-all ${
            isUser
              ? "rounded-[1.4rem] rounded-tr-none bg-primary text-white font-medium"
              : "rounded-[1.4rem] rounded-tl-none bg-slate-800/80 border border-white/5 text-slate-200"
          }`}
        >
          <div className="whitespace-pre-wrap break-words">
            {message.content}
          </div>

          {/* Subtle reflection on user bubbles */}
          {isUser && (
            <div className="absolute inset-0 rounded-[1.4rem] rounded-tr-none bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
          )}
        </div>

        <span className="px-1 text-[10px] font-medium uppercase tracking-tighter text-slate-500 opacity-0 transition-opacity group-hover:opacity-100">
          {formatChatTime(message.ts)}
        </span>
      </div>
    </motion.div>
  );
}
