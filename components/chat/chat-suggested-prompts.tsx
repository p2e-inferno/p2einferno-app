"use client";

import { ArrowRight } from "lucide-react";
import { CHAT_SUGGESTED_PROMPTS } from "@/lib/chat/constants";

interface ChatSuggestedPromptsProps {
  onPromptSelect: (prompt: string) => Promise<void>;
}

export function ChatSuggestedPrompts({
  onPromptSelect,
}: ChatSuggestedPromptsProps) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {CHAT_SUGGESTED_PROMPTS.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={() => void onPromptSelect(item.prompt)}
          className="group inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-left text-xs font-medium text-slate-300 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-95"
        >
          <span>{item.label}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-50 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
        </button>
      ))}
    </div>
  );
}
