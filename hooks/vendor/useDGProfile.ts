/**
 * useDGProfile Hook
 *
 * Provides user state and stage upgrade functionality
 * for the DGTokenVendor contract.
 */

import { useUser } from "@privy-io/react-auth";
import { useDetectConnectedWalletAddress } from "@/hooks/useDetectConnectedWalletAddress";
import { useReadContract, useWriteContract } from "wagmi";
import { DG_TOKEN_VENDOR_ABI } from "@/lib/blockchain/shared/vendor-abi";
import { USER_STAGE_LABELS } from "@/lib/blockchain/shared/vendor-constants";

const VENDOR_ADDRESS = process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS as `0x${string}`;

export interface UserState {
  stage: number;
  points: bigint;
  fuel: bigint;
  lastStage3MaxSale: bigint;
  dailySoldAmount: bigint;
  dailyWindowStart: bigint;
}

type UserStateStruct = {
  stage: number;
  points: bigint;
  fuel: bigint;
  lastStage3MaxSale: bigint;
  dailySoldAmount: bigint;
  dailyWindowStart: bigint;
};

export function useDGProfile() {
  const { user } = useUser();
  const { walletAddress } = useDetectConnectedWalletAddress(user);
  const { writeContract, data: hash, isPending } = useWriteContract();

  // Read user state
  const { data: userStateRaw, refetch: refetchState } = useReadContract({
    address: VENDOR_ADDRESS,
    abi: DG_TOKEN_VENDOR_ABI,
    functionName: "getUserState",
    args: [walletAddress! as `0x${string}`],
    query: { enabled: !!walletAddress },
  });

  const raw = userStateRaw as UserStateStruct | undefined;
  const userState: UserState | undefined = raw
    ? {
        stage: raw.stage,
        points: raw.points,
        fuel: raw.fuel,
        lastStage3MaxSale: raw.lastStage3MaxSale,
        dailySoldAmount: raw.dailySoldAmount,
        dailyWindowStart: raw.dailyWindowStart,
      }
    : undefined;

  const { data: hasKeyData } = useReadContract({
    address: VENDOR_ADDRESS,
    abi: DG_TOKEN_VENDOR_ABI,
    functionName: "hasValidKey",
    args: [walletAddress! as `0x${string}`],
    query: { enabled: !!walletAddress },
  });

  const { data: pausedData } = useReadContract({
    address: VENDOR_ADDRESS,
    abi: DG_TOKEN_VENDOR_ABI,
    functionName: "paused",
  });

  const currentStage = userState?.stage ?? 0;
  const nextStage = currentStage + 1;
  const isMaxStage = currentStage >= 2;

  const { data: nextStageConfigRaw } = useReadContract({
    address: VENDOR_ADDRESS,
    abi: DG_TOKEN_VENDOR_ABI,
    functionName: "getStageConfig",
    args: [nextStage],
    query: { enabled: !isMaxStage },
  });

  type StageConfigStruct = {
    burnAmount: bigint;
    upgradePointsThreshold: bigint;
    upgradeFuelThreshold: bigint;
    fuelRate: bigint;
    pointsAwarded: bigint;
    qualifyingBuyThreshold: bigint;
    maxSellBps: bigint;
    dailyLimitMultiplier: bigint;
  };

  const nextStageConfig = nextStageConfigRaw as StageConfigStruct | undefined;

  const stageLabel =
    userState && USER_STAGE_LABELS[userState.stage] !== undefined
      ? USER_STAGE_LABELS[userState.stage]
      : "Unknown";

  const isKeyHolder = Boolean(hasKeyData);
  const isPaused = Boolean(pausedData);

  const pointsRequired = nextStageConfig?.upgradePointsThreshold;
  const fuelRequired = nextStageConfig?.upgradeFuelThreshold;

  const pointsProgress =
    pointsRequired && pointsRequired > 0n && userState
      ? Math.min(
          Number(userState.points) / Number(pointsRequired),
          1,
        )
      : 0;

  const fuelProgress =
    fuelRequired && fuelRequired > 0n && userState
      ? Math.min(Number(userState.fuel) / Number(fuelRequired), 1)
      : 0;

  const upgradeProgress =
    isMaxStage || !nextStageConfig ? 1 : Math.min(pointsProgress, fuelProgress);

  const hasPoints =
    !isMaxStage && pointsRequired !== undefined && userState
      ? userState.points >= pointsRequired
      : false;
  const hasFuel =
    !isMaxStage && fuelRequired !== undefined && userState
      ? userState.fuel >= fuelRequired
      : false;

  const canUpgrade =
    !isPaused && isKeyHolder && !isMaxStage && hasPoints && hasFuel;

  const upgradeBlockedReason = (() => {
    if (isMaxStage) return "Max stage reached";
    if (!isKeyHolder) return "Valid NFT key required";
    if (isPaused) return "Vendor is paused";
    if (!hasPoints) return "Insufficient points";
    if (!hasFuel) return "Insufficient fuel";
    return null;
  })();

    /**
     * Upgrade to the next stage
     * User must meet points and fuel thresholds
     */
  const upgradeStage = () => {
    writeContract({
      address: VENDOR_ADDRESS,
      abi: DG_TOKEN_VENDOR_ABI,
      functionName: "upgradeStage",
    });
  };

  return {
    userState,
    stageLabel,
    isKeyHolder,
    isPaused,
    canUpgrade,
    upgradeBlockedReason,
    pointsProgress,
    fuelProgress,
    upgradeProgress,
    pointsRequired,
    fuelRequired,
    nextStage,
    upgradeStage,
    refetchState,
    isPending,
    hash,
  };
}
