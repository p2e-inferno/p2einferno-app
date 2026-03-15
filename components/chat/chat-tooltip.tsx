"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface ChatTooltipProps {
  label: string;
  children: React.ReactNode;
}

export const ChatTooltip = ({ label, children }: ChatTooltipProps) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relative flex flex-col items-center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-full mt-2 flex flex-col items-center pointer-events-none z-[60]"
          >
            <div className="-mb-1 h-2 w-2 rotate-45 bg-slate-800 border-l border-t border-white/10 shadow-sm" />
            <div className="whitespace-nowrap rounded-lg bg-slate-800 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-primary shadow-2xl border border-white/10">
              {label}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
