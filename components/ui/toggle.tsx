import { cn } from "@/lib/utils/wallet-change";

interface ToggleProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export default function Toggle({
  id,
  checked,
  onCheckedChange,
  disabled = false,
  className,
  ariaLabel,
}: ToggleProps) {
  return (
    <button
      id={id}
      type="button"
      onClick={() => onCheckedChange(!checked)}
      disabled={disabled}
      aria-pressed={checked}
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-flame-yellow focus:ring-offset-2 focus:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "bg-flame-yellow" : "bg-gray-600",
        className,
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}
