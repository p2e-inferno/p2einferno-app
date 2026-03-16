"use client";

import { motion, useReducedMotion } from "framer-motion";

export function ChatTypingIndicator() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="flex items-center gap-1.5 px-0.5 py-1">
      <span className="sr-only">Assistant is typing</span>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-primary/50"
          animate={
            prefersReducedMotion
              ? undefined
              : {
                  opacity: [0.3, 1, 0.3],
                  scale: [0.8, 1.1, 0.8],
                }
          }
          transition={
            prefersReducedMotion
              ? undefined
              : {
                  duration: 1.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.2,
                }
          }
        />
      ))}
    </div>
  );
}
