/**
 * Verification Strategy Registry
 *
 * Returns the appropriate verification strategy for a given task type.
 * Implements the Strategy pattern for extensible verification.
 */

import type { TaskType } from "@/lib/supabase/types";
import type { VerificationStrategy } from "./types";
import { VendorVerificationStrategy } from "./vendor-verification";
import { DeployLockVerificationStrategy } from "./deploy-lock-verification";
import { AIVerificationStrategy } from "./ai-vision-verification";
import { UniswapVerificationStrategy } from "./uniswap-verification";
import { DailyCheckinVerificationStrategy } from "./daily-checkin-verification";
import { GoodDollarVerificationStrategy } from "./gooddollar-verification";
import { InAppPulloutVerificationStrategy } from "./in-app-pullout-verification";
import { createViemPublicClient } from "@/lib/blockchain/providers/privy-viem";
import { createPublicClientForChain } from "@/lib/blockchain/config/clients/public-client";
import { base } from "viem/chains";

// Create a shared public client instance (app default chain)
const publicClient = createViemPublicClient();

// Uniswap verification must always query Base Mainnet regardless of the app's
// configured default chain (which may be Base Sepolia in non-prod environments).
const baseMainnetClient = createPublicClientForChain(base);

// Singleton strategy instances
const vendorStrategy = new VendorVerificationStrategy(publicClient);
const deployLockStrategy = new DeployLockVerificationStrategy();
const aiStrategy = new AIVerificationStrategy();
const uniswapStrategy = new UniswapVerificationStrategy(baseMainnetClient);
const dailyCheckinStrategy = new DailyCheckinVerificationStrategy();
const goodDollarStrategy = new GoodDollarVerificationStrategy();
const inAppPulloutStrategy = new InAppPulloutVerificationStrategy();

// Map of task types to their verification strategies
const strategies: Partial<Record<TaskType, VerificationStrategy>> = {
  vendor_buy: vendorStrategy,
  vendor_sell: vendorStrategy,
  vendor_light_up: vendorStrategy,
  vendor_level_up: vendorStrategy,
  deploy_lock: deployLockStrategy,
  submit_proof: aiStrategy,
  uniswap_swap: uniswapStrategy,
  daily_checkin: dailyCheckinStrategy,
  gooddollar_verified: goodDollarStrategy,
  in_app_pullout: inAppPulloutStrategy,
};

/**
 * Get the verification strategy for a task type
 * @param type The task type to get a strategy for
 * @returns The verification strategy, or undefined if none exists
 */
export function getVerificationStrategy(
  type: TaskType,
): VerificationStrategy | undefined {
  return strategies[type];
}
