import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUserFromNextRequest } from "@/lib/auth/privy";
import { ensureAdminOrRespond } from "@/lib/auth/route-handlers/admin-guard";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:admin:subscriptions:config");

// Helper to revalidate cache tags on config mutations
function invalidateConfigCache() {
  try {
    revalidateTag("subscriptions-config");
  } catch (err) {
    log.warn("revalidateTag failed", { err });
  }
}

interface SubscriptionConfigResponse {
  success: boolean;
  data?: {
    xpServiceFeePercent: number;
    treasuryBalance: number;
    updatedAt: string | null;
    updatedBy: string | null;
  };
  error?: string;
}

/**
 * GET - Fetch current subscription configuration
 * Public endpoint (no auth guard for reads)
 */
export async function GET(): Promise<NextResponse<SubscriptionConfigResponse>> {
  try {
    const supabase = createAdminClient();

    // Fetch service fee percent from system_config
    const { data: feeData, error: feeError } = await supabase
      .from("system_config")
      .select("value, updated_at, updated_by")
      .eq("key", "subscription_xp_service_fee_percent")
      .single();

    // Fetch treasury balance from subscription_treasury
    const { data: treasuryData, error: treasuryError } = await supabase
      .from("subscription_treasury")
      .select("total_xp, updated_at")
      .single();

    // Use defaults if queries don't find rows (PGRST116 = no rows)
    const xpServiceFeePercent = feeData ? parseFloat(feeData.value) : 1.0;
    const treasuryBalance = treasuryData ? treasuryData.total_xp : 0;
    const updatedAt = feeData?.updated_at || null;
    const updatedBy = feeData?.updated_by || null;

    // Log non-critical errors (row not found is expected)
    if (feeError && feeError.code !== "PGRST116") {
      log.warn("Failed to fetch service fee config", { error: feeError });
    }
    if (treasuryError && treasuryError.code !== "PGRST116") {
      log.warn("Failed to fetch treasury balance", { error: treasuryError });
    }

    return NextResponse.json({
      success: true,
      data: {
        xpServiceFeePercent,
        treasuryBalance,
        updatedAt,
        updatedBy,
      },
    });
  } catch (error: any) {
    log.error("subscriptions-config GET failed", { error });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * PUT - Update subscription configuration (service fee %)
 * Admin-only endpoint
 */
export async function PUT(
  req: NextRequest,
): Promise<NextResponse<SubscriptionConfigResponse>> {
  try {
    const guard = await ensureAdminOrRespond(req);
    if (guard) return guard as NextResponse<SubscriptionConfigResponse>;

    const user = await getPrivyUserFromNextRequest(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { xpServiceFeePercent } = await req.json();

    // Validate input
    if (typeof xpServiceFeePercent !== "number") {
      return NextResponse.json(
        { success: false, error: "xpServiceFeePercent must be a number" },
        { status: 400 },
      );
    }

    if (xpServiceFeePercent < 0.5 || xpServiceFeePercent > 3.0) {
      return NextResponse.json(
        { success: false, error: "Service fee must be between 0.5% and 3.0%" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    // Update service fee in system_config
    const { error: updateError } = await supabase
      .from("system_config")
      .update({
        value: xpServiceFeePercent.toString(),
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("key", "subscription_xp_service_fee_percent");

    if (updateError) {
      log.error("Failed to update service fee", { error: updateError });
      return NextResponse.json(
        { success: false, error: "Failed to update service fee" },
        { status: 500 },
      );
    }

    // Log to audit trail
    const ipAddress =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    await supabase.from("config_audit_log").insert([
      {
        config_key: "subscription_xp_service_fee_percent",
        new_value: xpServiceFeePercent.toString(),
        changed_by: user.id,
        ip_address: ipAddress,
        user_agent: userAgent,
      },
    ]);

    log.info("Service fee updated", {
      xpServiceFeePercent,
      userId: user.id,
    });

    invalidateConfigCache();

    return NextResponse.json({
      success: true,
      data: {
        xpServiceFeePercent,
        treasuryBalance: 0, // Not returned on PUT, fetch with GET
        updatedAt: new Date().toISOString(),
        updatedBy: user.id,
      },
    });
  } catch (error: any) {
    log.error("subscriptions-config PUT failed", { error });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST - Burn subscription treasury XP
 * Admin-only endpoint
 */
export async function POST(
  req: NextRequest,
): Promise<NextResponse<SubscriptionConfigResponse>> {
  try {
    const guard = await ensureAdminOrRespond(req);
    if (guard) return guard as NextResponse<SubscriptionConfigResponse>;

    const user = await getPrivyUserFromNextRequest(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { xpAmountToBurn, reason } = await req.json();

    // Validate inputs
    if (typeof xpAmountToBurn !== "number") {
      return NextResponse.json(
        { success: false, error: "xpAmountToBurn must be a number" },
        { status: 400 },
      );
    }

    if (xpAmountToBurn <= 0) {
      return NextResponse.json(
        { success: false, error: "Burn amount must be greater than 0" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    // Fetch current balance
    const { data: treasuryData, error: fetchError } = await supabase
      .from("subscription_treasury")
      .select("total_xp")
      .single();

    if (fetchError) {
      log.error("Failed to fetch treasury balance", { error: fetchError });
      return NextResponse.json(
        { success: false, error: "Failed to fetch treasury balance" },
        { status: 500 },
      );
    }

    const currentBalance = treasuryData?.total_xp || 0;

    // Validate burn amount
    if (xpAmountToBurn > currentBalance) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient balance. Available: ${currentBalance}, Requested: ${xpAmountToBurn}`,
        },
        { status: 400 },
      );
    }

    // Call RPC function to burn treasury
    const { error: burnError } = await supabase.rpc(
      "burn_subscription_treasury",
      {
        burn_amount_xp: xpAmountToBurn,
        burn_reason: reason || "Manual admin burn",
        admin_user_id: user.id,
      },
    );

    if (burnError) {
      log.error("Failed to burn treasury", {
        error: burnError,
        xpAmountToBurn,
      });
      return NextResponse.json(
        { success: false, error: "Failed to burn treasury" },
        { status: 500 },
      );
    }

    const newBalance = currentBalance - xpAmountToBurn;

    log.info("Treasury burned", {
      xpAmountToBurn,
      reason,
      userId: user.id,
      newBalance,
    });

    invalidateConfigCache();

    return NextResponse.json({
      success: true,
      data: {
        xpServiceFeePercent: 0, // Not returned on POST
        treasuryBalance: newBalance,
        updatedAt: new Date().toISOString(),
        updatedBy: user.id,
      },
    });
  } catch (error: any) {
    log.error("subscriptions-config POST failed", { error });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
