import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { withAdminAuth } from "@/lib/auth/admin-auth";
import { grantKeyService } from "@/lib/blockchain/grant-key-service";
import { isServerBlockchainConfigured } from "@/lib/blockchain/server-config";
import { isValidEthereumAddress } from "@/lib/blockchain/transaction-helpers";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:admin:reconcile-key-grants");

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isServerBlockchainConfigured()) {
    return res.status(503).json({
      error: "Blockchain configuration not available",
      message: "Server blockchain config is required for key reconciliation",
    });
  }

  try {
    const supabase = createAdminClient();
    const { operation, filters } = req.body;

    switch (operation) {
      case "list_failed_grants":
        return await listFailedKeyGrants(res, supabase, filters);
      case "retry_failed_grants":
        return await retryFailedKeyGrants(res, supabase, filters);
      case "retry_single_grant":
        return await retrySingleKeyGrant(res, supabase, req.body);
      default:
        return res.status(400).json({ error: "Invalid operation" });
    }
  } catch (error: any) {
    log.error("Reconciliation API error:", error);
    return res.status(500).json({
      error: error.message || "Internal server error",
    });
  }
}

export default withAdminAuth(handler);

async function listFailedKeyGrants(
  res: NextApiResponse,
  supabase: any,
  filters: any = {},
) {
  try {
    let query = supabase
      .from("user_activities")
      .select(
        `
        id,
        user_profile_id,
        activity_type,
        activity_data,
        created_at,
        user_profiles!inner(
          id,
          wallet_address,
          email,
          display_name,
          privy_user_id
        )
      `,
      )
      .eq("activity_type", "key_grant_failed")
      .order("created_at", { ascending: false });

    // Apply date filters
    if (filters.since) {
      query = query.gte("created_at", filters.since);
    }
    if (filters.until) {
      query = query.lte("created_at", filters.until);
    }

    const { data: failedGrants, error } = await query;

    if (error) throw error;

    // Process the data to make it more readable
    const processedGrants =
      failedGrants?.map((grant: any) => ({
        id: grant.id,
        userProfileId: grant.user_profile_id,
        userInfo: {
          walletAddress: grant.user_profiles.wallet_address,
          email: grant.user_profiles.email,
          displayName: grant.user_profiles.display_name,
          privyUserId: grant.user_profiles.privy_user_id,
        },
        failureDetails: {
          cohortId: grant.activity_data?.cohortId,
          lockAddress: grant.activity_data?.lockAddress,
          error: grant.activity_data?.error,
          attempts: grant.activity_data?.attempts,
          requiresReconciliation: grant.activity_data?.requiresReconciliation,
        },
        failedAt: grant.created_at,
      })) || [];

    return res.status(200).json({
      success: true,
      data: {
        failedGrants: processedGrants,
        total: processedGrants.length,
      },
    });
  } catch (error: any) {
    log.error("Error listing failed key grants:", error);
    return res.status(500).json({
      error: error.message || "Failed to list failed grants",
    });
  }
}

async function retryFailedKeyGrants(
  res: NextApiResponse,
  supabase: any,
  filters: any = {},
) {
  try {
    // Get failed grants to retry
    let query = supabase
      .from("user_activities")
      .select(
        `
        id,
        user_profile_id,
        activity_data,
        user_profiles!inner(
          wallet_address,
          privy_user_id
        )
      `,
      )
      .eq("activity_type", "key_grant_failed");

    // Apply filters
    if (filters.since) {
      query = query.gte("created_at", filters.since);
    }
    if (filters.userProfileId) {
      query = query.eq("user_profile_id", filters.userProfileId);
    }
    if (filters.cohortId) {
      query = query.contains("activity_data", { cohortId: filters.cohortId });
    }

    const { data: failedGrants, error } = await query.limit(
      filters.limit || 10,
    );

    if (error) throw error;

    const results = {
      attempted: 0,
      successful: 0,
      failed: 0,
      details: [] as any[],
    };

    for (const grant of failedGrants || []) {
      results.attempted++;

      const cohortId = grant.activity_data?.cohortId;
      const lockAddress = grant.activity_data?.lockAddress;
      const walletAddress = grant.user_profiles.wallet_address;

      if (
        !lockAddress ||
        !walletAddress ||
        !isValidEthereumAddress(walletAddress)
      ) {
        results.failed++;
        results.details.push({
          userProfileId: grant.user_profile_id,
          error: "Invalid wallet or lock address",
          cohortId,
          lockAddress,
          walletAddress,
        });
        continue;
      }

      try {
        log.info(
          `Reconciliation: Retrying key grant for user ${walletAddress}, cohort ${cohortId}`,
        );
        const grantResult = await grantKeyService.grantKeyToUser({
          walletAddress: walletAddress,
          lockAddress: lockAddress as `0x${string}`,
          keyManagers: [],
        });

        if (grantResult.success) {
          results.successful++;

          // Log successful reconciliation
          await supabase.from("user_activities").insert({
            user_profile_id: grant.user_profile_id,
            activity_type: "key_grant_reconciled",
            activity_data: {
              cohortId,
              lockAddress,
              transactionHash: grantResult.transactionHash,
              originalFailureId: grant.id,
              reconciledAt: new Date().toISOString(),
            },
            points_earned: 0,
          });

          // Mark original failure as reconciled
          await supabase
            .from("user_activities")
            .update({
              activity_data: {
                ...grant.activity_data,
                reconciledAt: new Date().toISOString(),
                reconciledBy: "admin_reconciliation",
              },
            })
            .eq("id", grant.id);

          results.details.push({
            userProfileId: grant.user_profile_id,
            success: true,
            cohortId,
            lockAddress,
            walletAddress,
            transactionHash: grantResult.transactionHash,
          });
        } else {
          results.failed++;
          results.details.push({
            userProfileId: grant.user_profile_id,
            error: grantResult.error,
            cohortId,
            lockAddress,
            walletAddress,
          });
        }
      } catch (error: any) {
        results.failed++;
        results.details.push({
          userProfileId: grant.user_profile_id,
          error: error.message || "Unexpected error",
          cohortId,
          lockAddress,
          walletAddress,
        });
      }

      // Add small delay between attempts to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return res.status(200).json({
      success: true,
      data: results,
    });
  } catch (error: any) {
    log.error("Error retrying failed key grants:", error);
    return res.status(500).json({
      error: error.message || "Failed to retry key grants",
    });
  }
}

async function retrySingleKeyGrant(
  res: NextApiResponse,
  supabase: any,
  requestBody: any,
) {
  const { userProfileId, cohortId, lockAddress, walletAddress } = requestBody;

  if (!userProfileId || !cohortId || !lockAddress || !walletAddress) {
    return res.status(400).json({
      error:
        "Missing required fields: userProfileId, cohortId, lockAddress, walletAddress",
    });
  }

  if (
    !isValidEthereumAddress(walletAddress) ||
    !isValidEthereumAddress(lockAddress)
  ) {
    return res.status(400).json({
      error: "Invalid wallet or lock address format",
    });
  }

  try {
    log.info(
      `Manual reconciliation: Granting key to user ${walletAddress} for cohort ${cohortId}`,
    );

    // Check if user already has a valid key
    const hasValidKey = await grantKeyService.userHasValidKey(
      walletAddress,
      lockAddress as `0x${string}`,
    );

    if (hasValidKey) {
      return res.status(200).json({
        success: true,
        message: "User already has a valid key",
        alreadyHasKey: true,
      });
    }

    const grantResult = await grantKeyService.grantKeyToUser({
      walletAddress: walletAddress,
      lockAddress: lockAddress as `0x${string}`,
      keyManagers: [],
    });

    if (grantResult.success) {
      // Log successful manual reconciliation
      await supabase.from("user_activities").insert({
        user_profile_id: userProfileId,
        activity_type: "key_grant_manual_reconciliation",
        activity_data: {
          cohortId,
          lockAddress,
          transactionHash: grantResult.transactionHash,
          reconciledAt: new Date().toISOString(),
          reconciledBy: "manual_admin_action",
        },
        points_earned: 0,
      });

      return res.status(200).json({
        success: true,
        message: "Key granted successfully",
        data: {
          transactionHash: grantResult.transactionHash,
        },
      });
    } else {
      return res.status(200).json({
        success: false,
        error: grantResult.error || "Key granting failed",
      });
    }
  } catch (error: any) {
    log.error("Manual key grant error:", error);
    return res.status(500).json({
      error: error.message || "Failed to grant key manually",
    });
  }
}
