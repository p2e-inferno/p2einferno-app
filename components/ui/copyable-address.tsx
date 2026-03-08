import React from "react";
import { formatWalletAddress } from "@/lib/utils/wallet-address";
import { copyToClipboard } from "@/lib/utils/clipboard";
import { cn } from "@/lib/utils/wallet-change";

interface CopyableAddressProps {
  /** The full wallet address to display and copy */
  address: string | null | undefined;
  /** Optional custom class name for styling the wrapper span */
  className?: string;
  /** Custom success message for the toast notification */
  successMessage?: string;
  /** Optional custom formatter function for the address display */
  formatter?: (address: string) => string;
  /** Whether to show a tooltip on hover (default: true) */
  showTooltip?: boolean;
}

/**
 * A reusable component for displaying a formatted wallet address that can be
 * clicked to copy the full address to the clipboard.
 */
export const CopyableAddress: React.FC<CopyableAddressProps> = ({
  address,
  className,
  successMessage = "Wallet address copied to clipboard",
  formatter = formatWalletAddress,
  showTooltip = true,
}) => {
  if (!address) return null;

  return (
    <span
      className={cn(
        "font-mono cursor-pointer transition-colors hover:text-blue-400",
        className,
      )}
      title={showTooltip ? "Click to copy full address" : undefined}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        copyToClipboard(address, successMessage);
      }}
    >
      {formatter(address)}
    </span>
  );
};
