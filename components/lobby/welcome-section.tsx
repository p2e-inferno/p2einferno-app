import React from "react";
import type { UserProfile } from "@/hooks/useDashboardData";

interface WelcomeSectionProps {
  profile: UserProfile;
}

/**
 * Welcome section component displaying user greeting and level
 */
export const WelcomeSection: React.FC<WelcomeSectionProps> = ({ profile }) => {
  return (
    <div className="text-center mb-6">
      <h2 className="text-3xl lg:text-4xl font-bold mb-2">
        Welcome, {profile.display_name}
      </h2>
    </div>
  );
};
