"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";

import { ChatTooltip } from "@/components/chat/chat-tooltip";

interface ChatTeaserProps {
  open: boolean;
  visible: boolean;
  dismissed: boolean;
  onOpen: () => Promise<void>;
  onDismiss: () => Promise<void>;
}

export function ChatTeaser({
  open,
  visible,
  dismissed,
  onOpen,
  onDismiss,
}: ChatTeaserProps) {
  return (
    <AnimatePresence>
      {!open && visible && !dismissed && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95, filter: "blur(10px)" }}
          animate={{
            opacity: 1,
            y: [0, 12, 0],
            scale: 1,
            filter: "blur(0px)",
          }}
          exit={{ opacity: 0, y: 20, scale: 0.95, filter: "blur(10px)" }}
          transition={{
            y: {
              duration: 1.2,
              repeat: Infinity,
              ease: "easeInOut",
            },
            opacity: { duration: 0.5 },
            scale: { duration: 0.5 },
            filter: { duration: 0.5 },
          }}
          className="absolute bottom-24 right-0 z-50 w-max"
        >
          <div className="relative w-[280px] max-w-[calc(100vw-4rem)] rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 shadow-2xl backdrop-blur-md">
            <div className="absolute right-2 top-2">
              <ChatTooltip label="Dismiss">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    void onDismiss();
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white/0 text-slate-500 transition-colors hover:bg-white/5 hover:text-white"
                  aria-label="Dismiss help teaser"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </ChatTooltip>
            </div>

            <button
              type="button"
              className="flex w-full items-start gap-3 text-left"
              onClick={() => void onOpen()}
              aria-label="Open chat assistant"
            >
              <motion.div
                animate={{ rotate: [0, -10, 10, -10, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-orange-600 shadow-lg shadow-primary/20"
              >
                <Sparkles className="h-5 w-5 text-white" />
              </motion.div>
              <div className="space-y-0.5">
                <p className="font-heading text-sm font-semibold tracking-tight text-white font-orbitron">
                  Need help?
                </p>
                <p className="text-xs leading-relaxed text-slate-400">
                  Ask me where to start 👇
                </p>
              </div>
            </button>

            {/* Carrot */}
            <div className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 border-b border-r border-white/10 bg-slate-900/90" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
