import React from "react";
import { FlameIcon } from "../icons/dashboard-icons";

/**
 * Loading state component for the infernal lobby
 * Displays while dashboard data is being fetched
 */
export const LobbyLoadingState: React.FC = () => {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: "#100F29" }}
    >
      <div className="text-center">
        <FlameIcon size={64} className="mx-auto mb-4 animate-pulse" />
        <p className="text-faded-grey">Loading your infernal realm...</p>
      </div>
    </div>
  );
};
