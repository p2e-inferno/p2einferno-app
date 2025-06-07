import React from "react";
import { AlertTriangle } from "lucide-react";

interface LobbyErrorStateProps {
  onRetry: () => void;
}

/**
 * Error state component for the infernal lobby
 * Displays when dashboard data fails to load with retry option
 */
export const LobbyErrorState: React.FC<LobbyErrorStateProps> = ({
  onRetry,
}) => {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: "#100F29" }}
    >
      <div className="text-center">
        <AlertTriangle size={64} className="mx-auto mb-4 text-red-400" />
        <p className="text-red-400 mb-4">Failed to load dashboard</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-flame-yellow text-black rounded-lg hover:bg-flame-orange transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
};
