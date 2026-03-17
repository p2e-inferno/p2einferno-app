"use client";

import { motion } from "framer-motion";
import { RefreshCw, Trash2 } from "lucide-react";
import { formatChatTime } from "@/lib/chat/utils";
import type { ChatMessage } from "@/lib/chat/types";
import { RichText } from "@/components/common/RichText";

interface ChatMessageBubbleProps {
  message: ChatMessage;
  onRetry?: () => void;
  onDelete?: () => void;
}

export function ChatMessageBubble({
  message,
  onRetry,
  onDelete,
}: ChatMessageBubbleProps) {
  const isUser = message.role === "user";
  const isFailed = isUser && message.status === "error";
  const isRateLimitError =
    isFailed &&
    (message.error?.includes("reached your chat limit") ||
      message.error?.includes("too quickly"));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex w-full group ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`flex ${isRateLimitError ? "w-full" : "max-w-[85%]"} flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}
      >
        <div
          className={`relative px-4 py-3 text-sm leading-relaxed shadow-sm transition-all ${
            isFailed
              ? "rounded-[1.4rem] rounded-tr-none bg-red-900/60 border border-red-500/30 text-white/70 font-medium"
              : isUser
                ? "rounded-[1.4rem] rounded-tr-none bg-primary text-white font-medium"
                : "rounded-[1.4rem] rounded-tl-none bg-slate-800/80 border border-white/5 text-slate-200"
          }`}
        >
          {/* Render image attachments if any */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {message.attachments.map((attachment, index) => (
                <img
                  key={index}
                  src={attachment.data}
                  alt={attachment.name || "Attached image"}
                  className={`rounded-lg max-h-48 object-cover max-w-full ${isFailed ? "opacity-50" : ""}`}
                />
              ))}
            </div>
          )}

          <div
            className={`break-words ${
              isUser
                ? "[&_.prose-p]:text-white [&_.prose-strong]:text-white [&_.prose-ul]:text-white [&_.prose-ol]:text-white [&_a]:text-white [&_a]:underline"
                : ""
            }`}
          >
            <RichText
              content={message.content}
              className="prose-p:my-0.5 prose-ul:my-0.5 prose-ol:my-0.5 prose-li:my-0 prose-headings:my-1 first:mt-0 last:mb-0 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0"
            />
          </div>

          {/* Subtle reflection on user bubbles */}
          {isUser && !isFailed && (
            <div className="absolute inset-0 rounded-[1.4rem] rounded-tr-none bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
          )}
        </div>

        {/* Error action bar: retry / delete */}
        {isFailed && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex w-full flex-col ${isRateLimitError ? "items-start" : "items-end"} gap-2 px-1`}
          >
            <span
              className={`w-full ${isRateLimitError ? "text-left" : "text-right"} text-xs leading-5 font-medium text-red-300/90`}
            >
              {message.error || "Failed to send"}
            </span>
            <div className="flex items-center gap-1.5">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-medium text-slate-300 transition-all hover:bg-white/10 hover:text-white"
                  aria-label="Retry message"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-medium text-slate-300 transition-all hover:bg-red-500/20 hover:text-red-300"
                  aria-label="Delete message"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* Timestamp */}
        {!isFailed && (
          <span className="px-1 text-[10px] font-medium uppercase tracking-tighter text-slate-500 opacity-0 transition-opacity group-hover:opacity-100">
            {formatChatTime(message.ts)}
          </span>
        )}
      </div>
    </motion.div>
  );
}
