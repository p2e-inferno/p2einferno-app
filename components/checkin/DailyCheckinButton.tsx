/**
 * DailyCheckinButton Component
 * Interactive button for performing daily check-ins with visual feedback
 */

import React, { useState } from "react";
import { cn } from "@/lib/utils/wallet-change";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, Clock, Zap } from "lucide-react";
import {
  DailyCheckinButtonProps,
  CheckinResult,
} from "@/lib/checkin/core/types";
import { useDailyCheckin } from "@/hooks/checkin";
import { formatXP } from "@/lib/checkin";

type ButtonSize = "sm" | "md" | "lg";

interface ExtendedDailyCheckinButtonProps extends DailyCheckinButtonProps {
  showPreview?: boolean;
  showCountdown?: boolean;
  animate?: boolean;
  customGreeting?: string;
}

export const DailyCheckinButton: React.FC<ExtendedDailyCheckinButtonProps> = ({
  userAddress,
  userProfileId,
  disabled = false,
  variant = "default",
  size = "md",
  greeting = "GM",
  showPreview = true,
  showCountdown = true,
  animate = true,
  customGreeting,
  onSuccess,
  onError,
  className,
}) => {
  const [isAnimating, setIsAnimating] = useState(false);

  const buttonSizeMap: Record<ButtonSize, "default" | "sm" | "lg"> = {
    sm: "sm",
    md: "default",
    lg: "lg",
  };

  const {
    canCheckinToday,
    hasCheckedInToday,
    previewXP,
    nextCheckinTime,
    isPerformingCheckin,
    performCheckin,
  } = useDailyCheckin(userAddress, userProfileId, {
    onCheckinSuccess: (result: CheckinResult) => {
      if (animate) {
        setIsAnimating(true);
        setTimeout(() => setIsAnimating(false), 2000);
      }
      onSuccess?.(result);
    },
    onCheckinError: onError,
  });

  // Format countdown timer
  const formatCountdown = (date: Date): string => {
    const now = new Date();
    const diff = date.getTime() - now.getTime();

    if (diff <= 0) return "Available now";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Handle click
  const handleClick = async () => {
    if (!canCheckinToday || isPerformingCheckin || disabled) return;

    await performCheckin(customGreeting || greeting);
  };

  // Button content based on state
  const getButtonContent = () => {
    if (isPerformingCheckin) {
      return (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Checking in...
        </>
      );
    }

    if (hasCheckedInToday) {
      return (
        <>
          <CheckCircle className="w-4 h-4" />
          Checked in today
        </>
      );
    }

    if (!canCheckinToday && nextCheckinTime) {
      return (
        <>
          <Clock className="w-4 h-4" />
          {showCountdown
            ? formatCountdown(nextCheckinTime)
            : "Come back tomorrow"}
        </>
      );
    }

    return (
      <>
        <span className="text-lg mr-1">🌅</span>
        Check in for today
      </>
    );
  };

  // Button variant based on state
  const getButtonVariant = () => {
    if (hasCheckedInToday) return "outline";
    if (!canCheckinToday) return "ghost";
    return variant;
  };

  // Button disabled state
  const isButtonDisabled = disabled || isPerformingCheckin || !canCheckinToday;

  // Tooltip content
  const getTooltipContent = () => {
    if (hasCheckedInToday) {
      return "You've already checked in today! Come back tomorrow.";
    }

    if (!canCheckinToday && nextCheckinTime) {
      return `Next check-in available at ${nextCheckinTime.toLocaleTimeString()}`;
    }

    if (previewXP > 0) {
      return `Check in to earn ${formatXP(previewXP)}!`;
    }

    return "Click to perform your daily check-in";
  };

  const tooltipContent = getTooltipContent();

  const buttonClasses = cn(
    "relative transition-all duration-300",
    animate && isAnimating && "scale-105 shadow-lg",
    hasCheckedInToday && "cursor-default",
    canCheckinToday && !hasCheckedInToday && "hover:scale-105",
    className,
  );

  return (
    <div className={cn("relative", className)}>
      <Button
        variant={getButtonVariant()}
        size={buttonSizeMap[size]}
        disabled={isButtonDisabled}
        onClick={handleClick}
        title={tooltipContent}
        className={buttonClasses}
      >
        {getButtonContent()}

        {/* Success animation overlay */}
        {animate && isAnimating && (
          <div className="absolute inset-0 flex items-center justify-center bg-green-500 text-white rounded-md">
            <CheckCircle className="w-5 h-5" />
          </div>
        )}
      </Button>

      {/* XP Preview Badge */}
      {showPreview &&
        canCheckinToday &&
        !hasCheckedInToday &&
        previewXP > 0 && (
          <Badge
            variant="secondary"
            className="absolute -top-2 -right-2 bg-green-100 text-green-700 border-green-200"
          >
            <Zap className="w-3 h-3 mr-1" />+{previewXP}
          </Badge>
        )}

      {/* Success badge */}
      {hasCheckedInToday && (
        <Badge
          variant="secondary"
          className="absolute -top-2 -right-2 bg-blue-100 text-blue-700 border-blue-200"
        >
          <CheckCircle className="w-3 h-3" />
        </Badge>
      )}
    </div>
  );
};

// Compact variant for smaller spaces
export const CompactCheckinButton: React.FC<ExtendedDailyCheckinButtonProps> = (
  props,
) => {
  return (
    <DailyCheckinButton
      {...props}
      size="sm"
      showPreview={false}
      showCountdown={false}
      className={cn("px-3 py-1", props.className)}
    />
  );
};

// Large variant with enhanced visuals
export const LargeCheckinButton: React.FC<
  ExtendedDailyCheckinButtonProps & {
    showStats?: boolean;
  }
> = ({ showStats = true, ...props }) => {
  const { previewXP, canCheckinToday, hasCheckedInToday } = useDailyCheckin(
    props.userAddress,
    props.userProfileId,
  );

  return (
    <div className="space-y-2">
      <DailyCheckinButton
        {...props}
        size="lg"
        className={cn("w-full py-3 text-lg", props.className)}
      />

      {showStats && canCheckinToday && !hasCheckedInToday && previewXP > 0 && (
        <div className="text-center text-sm text-muted-foreground">
          Earn {formatXP(previewXP)} for checking in today
        </div>
      )}
    </div>
  );
};

// Loading skeleton
export const CheckinButtonSkeleton: React.FC<{
  size?: "sm" | "md" | "lg";
  className?: string;
}> = ({ size = "md", className }) => {
  const sizeClasses = {
    sm: "h-8 w-24",
    md: "h-10 w-32",
    lg: "h-12 w-40",
  };

  return (
    <div
      className={cn(
        "bg-muted rounded-md animate-pulse",
        sizeClasses[size],
        className,
      )}
    />
  );
};

// Error state component
export const CheckinButtonError: React.FC<{
  error: string;
  onRetry?: () => void;
  className?: string;
}> = ({ error, onRetry, className }) => {
  return (
    <div className={cn("space-y-2", className)}>
      <Button variant="destructive" disabled className="w-full">
        Error: {error}
      </Button>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="w-full"
        >
          Try again
        </Button>
      )}
    </div>
  );
};
