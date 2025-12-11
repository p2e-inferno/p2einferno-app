/**
 * Component: MethodSelectionModal
 * Unified modal for selecting subscription payment method
 */

"use client";

import { X } from "lucide-react";

interface Props {
  mode: "purchase" | "renewal";
  onSelectMethod: (method: "crypto" | "xp" | "paystack") => void;
  onClose: () => void;
}

export const MethodSelectionModal = ({ mode, onSelectMethod, onClose }: Props) => {
  const title = mode === "purchase" ? "Get Membership" : "Renew Membership";
  const description =
    mode === "purchase"
      ? "Choose your preferred payment method to get DG Nation membership"
      : "Choose your preferred payment method to renew your subscription";

  const methods = [
    {
      id: "crypto" as const,
      icon: "💰",
      name: "Crypto",
      description: "Pay with ETH or tokens from your wallet",
      available: true,
      showInPurchase: true,
      showInRenewal: true,
    },
    {
      id: "xp" as const,
      icon: "⚡",
      name: "Experience Points",
      description: "Use your earned XP to renew",
      available: true,
      showInPurchase: false, // XP only for renewals
      showInRenewal: true,
    },
    {
      id: "paystack" as const,
      icon: "💳",
      name: "Credit/Debit Card",
      description: "Coming soon - Pay with your card",
      available: false,
      showInPurchase: true,
      showInRenewal: true,
    },
  ];

  // Filter methods based on mode
  const visibleMethods = methods.filter((method) =>
    mode === "purchase" ? method.showInPurchase : method.showInRenewal
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg text-white">{title}</h3>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <p className="text-sm text-gray-400 mb-6">{description}</p>

          {/* Payment Methods */}
          <div className="space-y-3 mb-6">
            {visibleMethods.map((method) => (
              <button
                key={method.id}
                onClick={() => method.available && onSelectMethod(method.id)}
                disabled={!method.available}
                className={`w-full p-4 rounded-lg border-2 transition text-left ${
                  method.available
                    ? "border-gray-600 hover:border-blue-500 hover:bg-blue-500/10 cursor-pointer"
                    : "border-gray-700 bg-gray-800/50 cursor-not-allowed opacity-60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{method.icon}</span>
                  <div className="flex-1">
                    <div className="font-semibold text-base text-white">
                      {method.name}
                    </div>
                    <div className="text-sm text-gray-400 mt-1">
                      {method.description}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <button
            className="w-full px-4 py-2 border border-gray-600 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
