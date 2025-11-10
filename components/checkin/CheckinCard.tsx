/**
 * CheckinCard Component
 * Complete daily check-in card with streak display and check-in functionality
 */

import React, { useState } from "react";
import { cn } from "@/lib/utils/wallet-change";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CalendarDays,
  TrendingUp,
  Zap,
  RotateCcw,
  Info,
  ChevronRight,
} from "lucide-react";
import { CheckinCardProps, CheckinResult } from "@/lib/checkin/core/types";
import { useDailyCheckin, useStreakData } from "@/hooks/checkin";
import {
  StreakDisplay,
  StreakBadge,
  StreakDisplaySkeleton,
} from "./StreakDisplay";
import {
  DailyCheckinButton,
  CheckinButtonSkeleton,
  CheckinButtonError,
} from "./DailyCheckinButton";
import { formatXP, formatMultiplier } from "@/lib/checkin";
import { getLogger } from "@/lib/utils/logger";

interface ExtendedCheckinCardProps extends CheckinCardProps {
  variant?: "default" | "minimal" | "detailed";
  showTabs?: boolean;
  defaultTab?: "checkin" | "streak" | "stats";
}

const log = getLogger("components:checkin-card");

export const CheckinCard: React.FC<ExtendedCheckinCardProps> = ({
  userAddress,
  userProfileId,
  showStreak = true,
  showPreview = true,
  compact = false,
  variant = "default",
  showTabs = false,
  defaultTab = "checkin",
  onCheckinSuccess,
  onCheckinError,
  className,
}) => {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Hooks
  const {
    canCheckinToday,
    hasCheckedInToday,
    checkinPreview,
    isLoading: isCheckinLoading,
    error: checkinError,
    refreshStatus,
  } = useDailyCheckin(userAddress, userProfileId, {
    autoRefreshStatus: true,
    // Uses default 12-hour interval (daily check-in feature)
    onCheckinSuccess: (result: CheckinResult) => {
      onCheckinSuccess?.(result);
    },
    onCheckinError,
  });

  const {
    streakInfo,
    currentTier,
    nextTier,
    multiplier,
    status: streakStatus,
    isLoading: isStreakLoading,
    error: streakError,
    refetch: refetchStreak,
  } = useStreakData(userAddress, {
    autoRefresh: true,
    // Uses default 12-hour interval (daily check-in feature)
  });

  // Combined loading and error states
  const isLoading = isCheckinLoading || isStreakLoading;
  const error = checkinError || streakError;

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refreshStatus(), refetchStreak()]);
    } catch (err) {
      log.error("Failed to refresh checkin card state", { err, userAddress });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Render error state
  if (error && !isLoading) {
    return (
      <Card className={cn("max-w-md", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-lg">🌅</span>
            Daily Check-in
          </CardTitle>
          <CardDescription>Something went wrong</CardDescription>
        </CardHeader>
        <CardContent>
          <CheckinButtonError error={error} onRetry={handleRefresh} />
        </CardContent>
      </Card>
    );
  }

  // Render loading state
  if (isLoading) {
    return (
      <Card className={cn("max-w-md", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-lg">🌅</span>
            Daily Check-in
          </CardTitle>
          <CardDescription>Loading your progress...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CheckinButtonSkeleton />
          {showStreak && <StreakDisplaySkeleton compact={compact} />}
        </CardContent>
      </Card>
    );
  }

  // Minimal variant
  if (variant === "minimal") {
    return (
      <Card className={cn("max-w-sm", className)}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🌅</span>
              <span className="font-semibold">Daily Check-in</span>
            </div>
            {showStreak && streakInfo && (
              <StreakBadge
                streak={streakInfo.currentStreak}
                multiplier={multiplier}
                status={streakStatus}
              />
            )}
          </div>

          <DailyCheckinButton
            userAddress={userAddress}
            userProfileId={userProfileId}
            onSuccess={onCheckinSuccess}
            onError={onCheckinError}
            className="w-full"
          />
        </CardContent>
      </Card>
    );
  }

  // Tabbed variant
  if (showTabs) {
    return (
      <Card className={cn("max-w-lg", className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <span className="text-lg">🌅</span>
                Daily Check-in
              </CardTitle>
              <CardDescription>
                {hasCheckedInToday
                  ? "Great job today!"
                  : "Keep your streak alive!"}
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RotateCcw
                className={cn("w-4 h-4", isRefreshing && "animate-spin")}
              />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as typeof activeTab)}
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="checkin">
                <CalendarDays className="w-4 h-4 mr-1" />
                Check-in
              </TabsTrigger>
              <TabsTrigger value="streak">
                <TrendingUp className="w-4 h-4 mr-1" />
                Streak
              </TabsTrigger>
              <TabsTrigger value="stats">
                <Zap className="w-4 h-4 mr-1" />
                Stats
              </TabsTrigger>
            </TabsList>

            <TabsContent value="checkin" className="space-y-4 mt-4">
              <DailyCheckinButton
                userAddress={userAddress}
                userProfileId={userProfileId}
                onSuccess={onCheckinSuccess}
                onError={onCheckinError}
                className="w-full"
                size="lg"
              />

              {showPreview && checkinPreview && (
                <div className="p-3 rounded-lg bg-muted/30 space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    Preview
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">XP Reward</p>
                      <p className="font-semibold">
                        {formatXP(checkinPreview.previewXP)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">New Streak</p>
                      <p className="font-semibold">
                        {checkinPreview.nextStreak} days
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="streak" className="mt-4">
              {streakInfo && (
                <StreakDisplay
                  streak={streakInfo.currentStreak}
                  multiplier={multiplier}
                  currentTier={currentTier}
                  nextTier={nextTier}
                  status={streakStatus}
                  compact={compact}
                />
              )}
            </TabsContent>

            <TabsContent value="stats" className="mt-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-sm text-muted-foreground">
                      Current Streak
                    </p>
                    <p className="text-2xl font-bold">
                      {streakInfo?.currentStreak || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">days</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-sm text-muted-foreground">Multiplier</p>
                    <p className="text-2xl font-bold">
                      {formatMultiplier(multiplier)}
                    </p>
                    <p className="text-xs text-muted-foreground">XP bonus</p>
                  </div>
                </div>

                {currentTier && (
                  <div className="p-3 rounded-lg border">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{currentTier.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Current tier
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className="text-lg font-bold"
                          style={{ color: currentTier.color }}
                        >
                          {currentTier.icon}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    );
  }

  // Default variant
  return (
    <Card className={cn("max-w-md", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span className="text-lg">🌅</span>
              Daily Check-in
            </CardTitle>
            <CardDescription>
              {hasCheckedInToday
                ? "You've checked in today!"
                : "Start your day right"}
            </CardDescription>
          </div>

          {/* Status badge */}
          <Badge variant={hasCheckedInToday ? "default" : "secondary"}>
            {hasCheckedInToday ? "Complete" : "Available"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Check-in button */}
        <DailyCheckinButton
          userAddress={userAddress}
          userProfileId={userProfileId}
          onSuccess={onCheckinSuccess}
          onError={onCheckinError}
          className="w-full"
          size="lg"
        />

        {/* Preview information */}
        {showPreview && canCheckinToday && checkinPreview && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-700">
                Earn {formatXP(checkinPreview.previewXP)} today
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-green-600" />
          </div>
        )}

        {/* Streak display */}
        {showStreak && streakInfo && (
          <>
            <Separator />
            <StreakDisplay
              streak={streakInfo.currentStreak}
              multiplier={multiplier}
              currentTier={currentTier}
              nextTier={nextTier}
              status={streakStatus}
              compact={compact}
            />
          </>
        )}

        {/* Refresh button */}
        <div className="flex justify-center pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="text-xs"
          >
            <RotateCcw
              className={cn("w-3 h-3 mr-1", isRefreshing && "animate-spin")}
            />
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Specialized variants
export const MinimalCheckinCard: React.FC<CheckinCardProps> = (props) => {
  return <CheckinCard {...props} variant="minimal" />;
};

export const DetailedCheckinCard: React.FC<CheckinCardProps> = (props) => {
  return <CheckinCard {...props} variant="detailed" showTabs={true} />;
};

// Card skeleton
export const CheckinCardSkeleton: React.FC<{
  variant?: "default" | "minimal" | "detailed";
  className?: string;
}> = ({ variant = "default", className }) => {
  return (
    <Card className={cn("max-w-md", className)}>
      <CardHeader>
        <div className="space-y-2">
          <div className="w-32 h-5 bg-muted rounded animate-pulse" />
          <div className="w-24 h-4 bg-muted rounded animate-pulse" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="w-full h-10 bg-muted rounded animate-pulse" />
        {variant !== "minimal" && (
          <>
            <div className="w-full h-px bg-muted" />
            <div className="space-y-3">
              <div className="w-full h-8 bg-muted rounded animate-pulse" />
              <div className="w-full h-2 bg-muted rounded animate-pulse" />
              <div className="w-full h-6 bg-muted rounded animate-pulse" />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
