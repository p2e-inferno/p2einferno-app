/**
 * GET /api/subscriptions/xp-renewal-quote
 * Get XP cost breakdown for renewal
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import { getLogger } from "@/lib/utils/logger";
import { createPublicClientUnified } from "@/lib/blockchain/config/clients/public-client";
import {
  calculateXpRenewalCost,
  getServiceFeePercent,
  validateRenewalParams,
} from "@/lib/helpers/xp-renewal-helpers";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { formatUnits } from "viem";

const log = getLogger("api:xp-renewal-quote");

interface QuoteResponse {
  success: boolean;
  data?: {
    baseCost: number;
    serviceFeePct: number;
    serviceFee: number;
    totalCost: number;
    userXpBalance: number;
    canAfford: boolean;
    daysRenewed: number;
  };
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<QuoteResponse>,
) {
  if (req.method !== "GET") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  try {
    // 1. Validate authentication
    const privy = await getPrivyUser(req, true);
    if (!privy || !privy.id) {
      log.warn("Unauthenticated quote request");
      return res
        .status(401)
        .json({ success: false, error: "Not authenticated" });
    }

    // 2. Validate duration parameter
    const duration = parseInt(req.query.duration as string, 10);
    if (![30, 90, 365].includes(duration)) {
      return res.status(400).json({
        success: false,
        error: "Invalid duration. Must be 30, 90, or 365",
      });
    }

    // 3. Get user's XP balance
    const supabase = createAdminClient();

    const { data: userProfile, error: userError } = await supabase
      .from("user_profiles")
      .select("experience_points")
      .eq("privy_user_id", privy.id)
      .single();

    if (userError || !userProfile) {
      log.error("User profile not found", { userId: privy.id, userError });
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const userXpBalance = userProfile.experience_points || 0;

    // 4. Get DG Nation lock address from environment
    const lockAddress = (process.env.NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS ||
      process.env.NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS_TESTNET) as `0x${string}`;

    if (!lockAddress) {
      log.error("DG Nation lock address not configured");
      return res.status(500).json({
        success: false,
        error: "System configuration error",
      });
    }

    // 5. Fetch lock key price from contract
    const publicClient = createPublicClientUnified();
    let keyPrice: bigint;

    try {
      keyPrice = (await publicClient.readContract({
        address: lockAddress,
        abi: COMPLETE_LOCK_ABI,
        functionName: "keyPrice",
      })) as bigint;
    } catch (contractError) {
      log.error("Failed to fetch key price from lock", {
        lockAddress,
        contractError,
      });
      return res.status(500).json({
        success: false,
        error: "Failed to fetch lock pricing",
      });
    }

    // Convert keyPrice from wei to DG units (assuming 18 decimals like most ERC20)
    const keyPriceDg = parseInt(formatUnits(keyPrice, 18));

    // DEBUG: Log raw contract values
    log.info("DEBUG: Contract key price", {
      rawKeyPrice: keyPrice.toString(),
      keyPriceDg,
      lockAddress,
    });

    // 6. Get service fee percent
    const serviceFeePct = await getServiceFeePercent(supabase);

    // 7. Calculate costs
    const costs = calculateXpRenewalCost(keyPriceDg, serviceFeePct);

    // 8. Validate renewal is possible
    const validation = validateRenewalParams(
      userXpBalance,
      costs.total,
      duration,
    );

    // DEBUG: Log full response data
    log.info("DEBUG: Full quote response", {
      userId: privy.id,
      duration,
      baseCost: costs.baseCost,
      serviceFee: costs.fee,
      totalCost: costs.total,
      serviceFeePct,
      userBalance: userXpBalance,
      canAfford: validation.valid,
    });

    return res.status(200).json({
      success: true,
      data: {
        baseCost: costs.baseCost,
        serviceFeePct,
        serviceFee: costs.fee,
        totalCost: costs.total,
        userXpBalance,
        canAfford: validation.valid,
        daysRenewed: duration,
      },
    });
  } catch (error: any) {
    log.error("Unexpected error in quote endpoint", { error });
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
}
