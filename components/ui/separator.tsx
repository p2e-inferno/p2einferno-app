import * as React from "react";
import { cn } from "@/lib/utils/wallet-change";

type SeparatorProps = React.HTMLAttributes<HTMLDivElement> & {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
};

export const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  (
    {
      className,
      orientation = "horizontal",
      decorative = true,
      role,
      ...props
    },
    ref,
  ) => {
    const ariaRole = decorative ? "presentation" : role;
    return (
      <div
        ref={ref}
        role={ariaRole}
        aria-orientation={orientation}
        className={cn(
          "bg-border",
          orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
          className,
        )}
        {...props}
      />
    );
  },
);

Separator.displayName = "Separator";
