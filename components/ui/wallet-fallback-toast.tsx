import React from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";

interface WalletFallbackToastProps {
  toastId: string;
}

export const WalletFallbackToast: React.FC<WalletFallbackToastProps> = ({
  toastId,
}) => {
  const handleDismiss = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    toast.dismiss(toastId);
  };

  return (
    <div
      onClick={handleDismiss}
      className="flex items-center gap-3 bg-blue-600 text-white p-4 rounded-lg cursor-pointer shadow-lg max-w-md relative"
      role="alert"
      aria-live="polite"
    >
      <span className="text-xl">ℹ️</span>
      <span className="flex-1 text-sm pr-2">
        Using embedded wallet — your external wallet is not available on this
        device
      </span>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 hover:bg-blue-700 rounded p-1 transition-colors"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
