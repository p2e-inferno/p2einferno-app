import React from "react";
import { Gamepad2 } from "lucide-react";

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
        <Gamepad2 className="mx-auto mb-4 animate-pulse w-16 h-16 text-flame-yellow" />
        <p className="text-faded-grey">Loading your infernal realm...</p>
      </div>
    </div>
  );
};
