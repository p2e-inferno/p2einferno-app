"use client";

import { motion } from "framer-motion";
import { Bot } from "lucide-react";

interface ChatLauncherProps {
  onOpen: () => Promise<void>;
}

export function ChatLauncher({ onOpen }: ChatLauncherProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.05, y: -2 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => void onOpen()}
      className="group relative h-16 w-16 overflow-hidden rounded-[1.75rem] bg-slate-900 p-[1px] shadow-2xl transition-all"
      aria-label="Open onboarding assistant"
    >
      {/* Animated Border Gradient */}
      <div className="absolute inset-[-100%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_25%,#ef4444_50%,transparent_75%)] opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="relative flex h-full w-full items-center justify-center rounded-[1.7rem] bg-slate-950 transition-colors group-hover:bg-slate-900">
        <Bot className="h-7 w-7 text-white transition-transform group-hover:scale-110" />

        {/* Notification Dot */}
        <span className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_10px_#ef4444]">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-75" />
        </span>
      </div>
    </motion.button>
  );
}
