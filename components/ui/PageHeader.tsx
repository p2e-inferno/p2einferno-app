import React from "react";
import { cn } from "@/lib/utils/wallet-change";

interface PageHeaderProps {
  title: string;
  description?: string;
  className?: string;
  centered?: boolean;
}

export function PageHeader({
  title,
  description,
  className,
  centered = true,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "bg-background border-b border-border/50 py-16 md:py-24 relative overflow-hidden",
        className,
      )}
    >
      {/* Background Pattern (Subtle) */}
      <div className="absolute inset-0 bg-[url('/images/grid-pattern.svg')] opacity-5 pointer-events-none" />

      <div className="container mx-auto px-4 relative z-10">
        <div className={cn("max-w-4xl", centered && "mx-auto text-center")}>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold font-heading mb-6 tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="text-lg md:text-xl text-faded-grey leading-relaxed max-w-2xl mx-auto mb-8">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
