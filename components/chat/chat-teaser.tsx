"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";

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
          initial={{ opacity: 0, y: 10, scale: 0.9, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: 10, scale: 0.9, filter: "blur(10px)" }}
          className="absolute bottom-20 right-0 z-50 w-max"
        >
          <div className="relative w-[280px] max-w-[calc(100vw-4rem)] rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 shadow-2xl backdrop-blur-md">
            <button
              onClick={(event) => {
                event.stopPropagation();
                void onDismiss();
              }}
              className="absolute right-2 top-2 text-slate-500 transition-colors hover:text-white"
              aria-label="Dismiss help teaser"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            <div
              className="flex cursor-pointer items-start gap-3"
              onClick={() => void onOpen()}
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
            </div>

            {/* Carrot */}
            <div className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 border-b border-r border-white/10 bg-slate-900/90" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

