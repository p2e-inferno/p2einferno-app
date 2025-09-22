/**
 * Daily Check-in Components - Public API
 * Main entry point for all daily check-in React components
 */

// Main components
export {
  StreakDisplay,
  StreakBadge,
  StreakDisplaySkeleton,
} from "./StreakDisplay";
export {
  DailyCheckinButton,
  CompactCheckinButton,
  LargeCheckinButton,
  CheckinButtonSkeleton,
  CheckinButtonError,
} from "./DailyCheckinButton";
export {
  CheckinCard,
  MinimalCheckinCard,
  DetailedCheckinCard,
  CheckinCardSkeleton,
} from "./CheckinCard";

// Re-export component prop types
export type {
  StreakDisplayProps,
  DailyCheckinButtonProps,
  CheckinCardProps,
} from "@/lib/checkin/core/types";

// Component composition utilities
import React from "react";
import { CheckinCard } from "./CheckinCard";
import { StreakDisplay } from "./StreakDisplay";
import { DailyCheckinButton } from "./DailyCheckinButton";
import { useStreakData } from "@/hooks/checkin";

/**
 * Complete check-in experience with all features
 */
export const FullCheckinExperience: React.FC<{
  userAddress: string;
  userProfileId: string;
  className?: string;
  onCheckinSuccess?: (result: any) => void;
  onCheckinError?: (error: string) => void;
}> = (props) => {
  return (
    <CheckinCard
      {...props}
      variant="detailed"
      showTabs={true}
      showStreak={true}
      showPreview={true}
    />
  );
};

/**
 * Simple check-in widget for dashboards
 */
export const CheckinWidget: React.FC<{
  userAddress: string;
  userProfileId: string;
  compact?: boolean;
  className?: string;
}> = ({ compact = true, ...props }) => {
  return (
    <CheckinCard
      {...props}
      variant="minimal"
      compact={compact}
      showStreak={compact}
      showPreview={!compact}
    />
  );
};

/**
 * Standalone streak display for profile pages
 */
export const ProfileStreakDisplay: React.FC<{
  userAddress: string;
  showProgress?: boolean;
  compact?: boolean;
  className?: string;
}> = ({ userAddress, showProgress = true, compact = false, className }) => {
  const { streakInfo, multiplier, currentTier, nextTier, status } =
    useStreakData(userAddress);

  return (
    <StreakDisplay
      streak={streakInfo?.currentStreak ?? 0}
      multiplier={multiplier}
      currentTier={currentTier}
      nextTier={nextTier}
      status={status}
      showProgress={showProgress}
      compact={compact}
      className={className}
    />
  );
};

/**
 * Check-in button for quick actions
 */
export const QuickCheckinButton: React.FC<{
  userAddress: string;
  userProfileId: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}> = ({ size = "md", ...props }) => {
  return (
    <DailyCheckinButton
      {...props}
      size={size}
      showPreview={size !== "sm"}
      animate={true}
    />
  );
};
