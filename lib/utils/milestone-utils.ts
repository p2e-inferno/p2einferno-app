export interface MilestoneTimingInfo {
  isExpired: boolean;
  isActive: boolean;
  isNotStarted: boolean;
  timeLeft?: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  };
  status: "not_started" | "active" | "expired";
}

export function getMilestoneTimingInfo(
  startDate?: string,
  endDate?: string,
): MilestoneTimingInfo {
  if (!endDate) {
    return {
      isExpired: false,
      isActive: true,
      isNotStarted: false,
      status: "active",
    };
  }

  const now = new Date().getTime();
  const endTime = new Date(endDate).getTime();
  const startTime = startDate ? new Date(startDate).getTime() : 0;

  if (now < startTime) {
    return {
      isExpired: false,
      isActive: false,
      isNotStarted: true,
      status: "not_started",
    };
  }

  if (now > endTime) {
    return {
      isExpired: true,
      isActive: false,
      isNotStarted: false,
      status: "expired",
    };
  }

  // Calculate time left
  const difference = endTime - now;
  const days = Math.floor(difference / (1000 * 60 * 60 * 24));
  const hours = Math.floor(
    (difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
  );
  const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((difference % (1000 * 60)) / 1000);

  return {
    isExpired: false,
    isActive: true,
    isNotStarted: false,
    timeLeft: { days, hours, minutes, seconds },
    status: "active",
  };
}

export function canEarnRewards(startDate?: string, endDate?: string): boolean {
  const timingInfo = getMilestoneTimingInfo(startDate, endDate);
  return timingInfo.isActive && !timingInfo.isExpired;
}
