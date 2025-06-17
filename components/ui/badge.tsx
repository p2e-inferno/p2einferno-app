import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, Copy } from "lucide-react";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-sm font-medium",
  {
    variants: {
      variant: {
        default: "bg-gray-800 text-white border border-gray-700",
        primary: "bg-steel-red text-white",
        secondary: "bg-gray-700 text-white",
        outline: "bg-transparent border border-gray-600 text-gray-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={`${badgeVariants({ variant, className })}`} {...props} />
  );
}

interface CopyBadgeProps extends Omit<BadgeProps, "onClick"> {
  value: string;
  showCopyButton?: boolean;
}

export function CopyBadge({
  value,
  className,
  variant = "outline",
  showCopyButton = true,
  ...props
}: CopyBadgeProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(() => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  return (
    <div className="flex items-center gap-2">
      <div
        className={`${badgeVariants({
          variant,
          className,
        })} ${showCopyButton ? "cursor-pointer" : ""}`}
        onClick={showCopyButton ? handleCopy : undefined}
        {...props}
      >
        <span>{value}</span>
        {showCopyButton && (
          <span className="ml-1.5">
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <Copy className="h-3.5 w-3.5 opacity-70" />
            )}
          </span>
        )}
      </div>
    </div>
  );
}
