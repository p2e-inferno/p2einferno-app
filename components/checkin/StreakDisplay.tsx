/**
 * StreakDisplay Component
 * Displays streak information with tier progress and visual indicators
 */

import React from "react";
import { cn } from "@/lib/utils/wallet-change";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  StreakDisplayProps,
  MultiplierTier,
  StreakStatus,
} from "@/lib/checkin/core/types";
import {
  formatStreakDuration,
  getStreakEmoji,
  getStreakMessage,
  formatMultiplier,
  getMultiplierColor,
} from "@/lib/checkin";

interface ExtendedStreakDisplayProps extends StreakDisplayProps {
  status?: StreakStatus;
  timeUntilExpiration?: number | null;
  showTimeRemaining?: boolean;
  onTierClick?: (tier: MultiplierTier) => void;
}

export const StreakDisplay: React.FC<ExtendedStreakDisplayProps> = ({
  streak,
  multiplier,
  currentTier,
  nextTier,
  showProgress = true,
  compact = false,
  status = "active",
  timeUntilExpiration,
  showTimeRemaining = false,
  onTierClick,
  className,
}) => {
  // Calculate progress percentage
  const progressPercentage = React.useMemo(() => {
    if (!currentTier || !nextTier) return 100;

    const tierRange = nextTier.minStreak - currentTier.minStreak;
    const progressInTier = streak - currentTier.minStreak;

    return Math.min((progressInTier / tierRange) * 100, 100);
  }, [streak, currentTier, nextTier]);

  // Format time remaining
  const formatTimeRemaining = (ms: number): string => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Get status color and indicator
  const getStatusIndicator = (status: StreakStatus) => {
    switch (status) {
      case "active":
        return { color: "text-green-600", bg: "bg-green-100", label: "Active" };
      case "at_risk":
        return {
          color: "text-amber-600",
          bg: "bg-amber-100",
          label: "At Risk",
        };
      case "broken":
        return { color: "text-red-600", bg: "bg-red-100", label: "Broken" };
      default:
        return { color: "text-gray-600", bg: "bg-gray-100", label: "New" };
    }
  };

  const statusIndicator = getStatusIndicator(status);
  const streakEmoji = getStreakEmoji(streak);
  const streakMessage = getStreakMessage(streak);
  const streakDuration = formatStreakDuration(streak);

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="text-lg">{streakEmoji}</span>
        <div className="flex flex-col">
          <span className="font-semibold text-sm">{streak} days</span>
          <span className="text-xs text-muted-foreground">
            {formatMultiplier(multiplier)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <Card className={cn("relative overflow-hidden", className)}>
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header with streak info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{streakEmoji}</span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg">{streak} Day Streak</h3>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-xs",
                      statusIndicator.bg,
                      statusIndicator.color,
                    )}
                  >
                    {statusIndicator.label}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{streakMessage}</p>
              </div>
            </div>

            {/* Multiplier display */}
            <div className="text-right">
              <div
                className="font-bold text-lg"
                style={{ color: getMultiplierColor(multiplier) }}
              >
                {formatMultiplier(multiplier)}
              </div>
              <p className="text-xs text-muted-foreground">multiplier</p>
            </div>
          </div>

          {/* Time remaining warning */}
          {showTimeRemaining &&
            timeUntilExpiration &&
            timeUntilExpiration < 3 * 60 * 60 * 1000 && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-amber-50 border border-amber-200">
                <span className="text-amber-600">⚠️</span>
                <span className="text-sm text-amber-700">
                  Streak expires in {formatTimeRemaining(timeUntilExpiration)}
                </span>
              </div>
            )}

          {/* Current tier info */}
          {currentTier && (
            <div
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border-2 transition-all",
                onTierClick ? "cursor-pointer hover:bg-muted/50" : "",
                "border-primary/20 bg-primary/5",
              )}
              onClick={() => onTierClick?.(currentTier)}
            >
              <div className="flex items-center gap-2">
                {currentTier.icon && (
                  <span className="text-lg">{currentTier.icon}</span>
                )}
                <div>
                  <p className="font-medium text-sm">{currentTier.name}</p>
                  {currentTier.description && (
                    <p className="text-xs text-muted-foreground">
                      {currentTier.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p
                  className="font-bold text-sm"
                  style={{ color: currentTier.color }}
                >
                  {formatMultiplier(currentTier.multiplier)}
                </p>
                <p className="text-xs text-muted-foreground">current</p>
              </div>
            </div>
          )}

          {/* Progress to next tier */}
          {showProgress && nextTier && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Progress to {nextTier.name}
                </span>
                <span className="font-medium">
                  {streak} / {nextTier.minStreak}
                </span>
              </div>

              <Progress value={progressPercentage} className="h-2" />

              {/* Next tier preview */}
              <div
                className={cn(
                  "flex items-center justify-between p-2 rounded-md border transition-all",
                  onTierClick ? "cursor-pointer hover:bg-muted/30" : "",
                  "border-muted bg-muted/20",
                )}
                onClick={() => nextTier && onTierClick?.(nextTier)}
              >
                <div className="flex items-center gap-2">
                  {nextTier.icon && (
                    <span className="text-sm">{nextTier.icon}</span>
                  )}
                  <div>
                    <p className="font-medium text-xs">{nextTier.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {nextTier.minStreak - streak} days to go
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className="font-bold text-xs"
                    style={{ color: nextTier.color }}
                  >
                    {formatMultiplier(nextTier.multiplier)}
                  </p>
                  <p className="text-xs text-muted-foreground">next</p>
                </div>
              </div>
            </div>
          )}

          {/* Additional streak details */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <span>Duration: {streakDuration}</span>
            {currentTier && <span>Tier: {currentTier.name}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Smaller variant for inline display
export const StreakBadge: React.FC<{
  streak: number;
  multiplier: number;
  status?: StreakStatus;
  className?: string;
}> = ({ streak, multiplier, status = "active", className }) => {
  const statusIndicator = React.useMemo(() => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-700 border-green-200";
      case "at_risk":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "broken":
        return "bg-red-100 text-red-700 border-red-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  }, [status]);

  return (
    <Badge
      variant="outline"
      className={cn(
        "flex items-center gap-1 px-2 py-1",
        statusIndicator,
        className,
      )}
    >
      <span>{getStreakEmoji(streak)}</span>
      <span className="font-semibold">{streak}</span>
      <span className="text-xs opacity-75">
        ({formatMultiplier(multiplier)})
      </span>
    </Badge>
  );
};

// Loading skeleton
export const StreakDisplaySkeleton: React.FC<{ compact?: boolean }> = ({
  compact,
}) => {
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-muted rounded animate-pulse" />
        <div className="space-y-1">
          <div className="w-16 h-4 bg-muted rounded animate-pulse" />
          <div className="w-12 h-3 bg-muted rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-muted rounded animate-pulse" />
            <div className="space-y-2">
              <div className="w-32 h-5 bg-muted rounded animate-pulse" />
              <div className="w-24 h-4 bg-muted rounded animate-pulse" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="w-12 h-5 bg-muted rounded animate-pulse" />
            <div className="w-16 h-3 bg-muted rounded animate-pulse" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="w-full h-8 bg-muted rounded animate-pulse" />
          <div className="w-full h-2 bg-muted rounded animate-pulse" />
          <div className="w-full h-6 bg-muted rounded animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
};
