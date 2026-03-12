"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { Input } from "@/components/ui/input";

interface ChatComposerProps {
  value: string;
  disabled: boolean;
  onChange: (value: string) => Promise<void>;
  onSubmit: (value: string) => Promise<void>;
}

export function ChatComposer({
  value,
  disabled,
  onChange,
  onSubmit,
}: ChatComposerProps) {
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(value);
  };

  const handleKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await onSubmit(value);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Input
            value={value}
            onChange={(event) => void onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            aria-label="Chat message"
            disabled={disabled}
            className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm text-white placeholder:text-slate-500 focus:border-white/20 focus:ring-0 focus:ring-offset-0 transition-all shadow-inner"
          />
        </div>
        <button
          type="submit"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:scale-[1.03] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Send message"
          disabled={disabled || value.trim().length === 0}
        >
          <Send className="h-4.5 w-4.5" />
        </button>
      </div>
    </form>
  );
}

