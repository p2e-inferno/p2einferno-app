/**
 * DG Token Vendor shared types
 *
 * Centralized TypeScript shapes for struct-like ABI outputs used across vendor hooks.
 * Keep in sync with `lib/blockchain/shared/vendor-abi.ts`.
 */

export type TokenConfigStruct = {
  baseToken: `0x${string}`;
  swapToken: `0x${string}`;
  exchangeRate: bigint;
};

export type FeeConfigStruct = {
  maxFeeBps: bigint;
  minFeeBps: bigint;
  buyFeeBps: bigint;
  sellFeeBps: bigint;
  rateChangeCooldown: bigint;
  appChangeCooldown: bigint;
};

export type StageConstantsStruct = {
  maxSellCooldown: bigint;
  dailyWindow: bigint;
  minBuyAmount: bigint;
  minSellAmount: bigint;
};

export type UserStateStruct = {
  stage: number;
  points: bigint;
  fuel: bigint;
  lastStage3MaxSale: bigint;
  dailySoldAmount: bigint;
  dailyWindowStart: bigint;
};

export type StageConfigStruct = {
  burnAmount: bigint;
  upgradePointsThreshold: bigint;
  upgradeFuelThreshold: bigint;
  fuelRate: bigint;
  pointsAwarded: bigint;
  qualifyingBuyThreshold: bigint;
  maxSellBps: bigint;
  dailyLimitMultiplier: bigint;
};

