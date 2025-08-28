import React from "react";
import { AlertTriangle, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LobbyConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
  isLoading?: boolean;
}

export default function LobbyConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel", 
  variant = "default",
  isLoading = false,
}: LobbyConfirmationModalProps) {
  if (!isOpen) return null;

  const getVariantConfig = () => {
    switch (variant) {
      case "danger":
        return {
          icon: Trash2,
          iconColor: "text-red-400",
          headerBg: "from-red-600/10 to-red-700/10",
          border: "border-red-500/20",
          confirmButton: "bg-red-600 hover:bg-red-700 text-white"
        };
      case "warning":
        return {
          icon: AlertTriangle,
          iconColor: "text-flame-yellow",
          headerBg: "from-flame-yellow/10 to-flame-orange/10", 
          border: "border-flame-yellow/20",
          confirmButton: "bg-flame-yellow text-black hover:bg-flame-orange"
        };
      default:
        return {
          icon: AlertTriangle,
          iconColor: "text-cyan-400",
          headerBg: "from-purple-600/10 to-indigo-600/10",
          border: "border-purple-500/20", 
          confirmButton: "bg-flame-yellow text-black hover:bg-flame-orange"
        };
    }
  };

  const config = getVariantConfig();
  const IconComponent = config.icon;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`bg-background border ${config.border} rounded-2xl w-full max-w-md`}>
        {/* Header */}
        <div className={`bg-gradient-to-r ${config.headerBg} p-6 border-b ${config.border} rounded-t-2xl`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <IconComponent size={24} className={config.iconColor} />
              <h2 className="text-xl font-bold">{title}</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              disabled={isLoading}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-faded-grey mb-6 leading-relaxed">
            {description}
          </p>

          {/* Actions */}
          <div className="flex space-x-3">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              {cancelText}
            </Button>
            <Button
              onClick={onConfirm}
              disabled={isLoading}
              className={`flex-1 ${config.confirmButton} transition-all`}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                confirmText
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}