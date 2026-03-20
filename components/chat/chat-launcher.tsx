"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bot } from "lucide-react";

interface ChatLauncherProps {
  onOpen: () => Promise<void>;
  rateLimitedUntil: number | null;
}

export function ChatLauncher({ onOpen, rateLimitedUntil }: ChatLauncherProps) {
  const [isOpening, setIsOpening] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(() =>
    rateLimitedUntil === null ? false : rateLimitedUntil > Date.now(),
  );

  useEffect(() => {
    if (rateLimitedUntil === null) {
      setIsRateLimited(false);
      return;
    }

    if (!Number.isFinite(rateLimitedUntil)) {
      setIsRateLimited(true);
      return;
    }

    const remainingMs = rateLimitedUntil - Date.now();
    if (remainingMs <= 0) {
      setIsRateLimited(false);
      return;
    }

    setIsRateLimited(true);
    const timer = window.setTimeout(() => {
      setIsRateLimited(false);
    }, remainingMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [rateLimitedUntil]);

  const handleOpen = async () => {
    if (isOpening) {
      return;
    }

    setIsOpening(true);
    try {
      await onOpen();
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <motion.button
      whileHover={isOpening ? undefined : { scale: 1.05, y: -2 }}
      whileTap={isOpening ? undefined : { scale: 0.95 }}
      onClick={() => void handleOpen()}
      disabled={isOpening}
      className={`group relative h-16 w-16 overflow-visible rounded-[1.75rem] bg-transparent p-0 shadow-none transition-all sm:overflow-hidden sm:bg-slate-900 sm:p-[1px] sm:shadow-2xl ${
        isOpening ? "cursor-wait opacity-80" : ""
      }`}
      aria-label="Open onboarding assistant"
    >
      {/* Animated Border Gradient */}
      <div className="absolute inset-[-100%] hidden animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_25%,#ef4444_50%,transparent_75%)] opacity-0 transition-opacity group-hover:opacity-100 sm:block" />

      <div className="absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 transition-colors group-hover:bg-slate-900 sm:relative sm:h-full sm:w-full sm:rounded-[1.7rem]">
        <Bot className="h-5 w-5 text-white transition-transform group-hover:scale-110 sm:h-7 sm:w-7" />

        {/* Notification Dot */}
        <span
          className={`absolute right-2.5 top-2.5 h-2 w-2 rounded-full sm:right-4 sm:top-4 sm:h-2.5 sm:w-2.5 ${
            isRateLimited
              ? "bg-primary shadow-[0_0_10px_#ef4444]"
              : "bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.9)]"
          }`}
        />
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute right-2.5 top-2.5 block h-2 w-2 rounded-full opacity-75 sm:right-4 sm:top-4 sm:h-2.5 sm:w-2.5 ${
            isRateLimited
              ? "bg-primary animate-ping"
              : "bg-emerald-400 animate-ping"
          }`}
        />
      </div>
    </motion.button>
  );
}
