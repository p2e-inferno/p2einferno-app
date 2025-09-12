import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { withAdminAuth } from "@/lib/auth/admin-auth";
import { isValidEthereumAddress } from "@/lib/blockchain/transaction-helpers";
import { unlockUtils } from "@/lib/unlock/lockUtils";
import type { EntityType } from "@/lib/utils/lock-deployment-state";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:admin:recover-lock-deployment");

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { lockAddress, entityType, entityData, deploymentId } = req.body;

  // Validate required fields
  if (!lockAddress || !entityType || !entityData) {
    return res.status(400).json({
      error: "Missing required fields: lockAddress, entityType, entityData",
    });
  }

  // Validate lock address format
  if (!isValidEthereumAddress(lockAddress)) {
    return res.status(400).json({
      error: "Invalid lock address format",
    });
  }

  // Validate entity type
  const validEntityTypes: EntityType[] = [
    "bootcamp",
    "cohort",
    "quest",
    "milestone",
  ];
  if (!validEntityTypes.includes(entityType)) {
    return res.status(400).json({
      error:
        "Invalid entity type. Must be one of: bootcamp, cohort, quest, milestone",
    });
  }

  try {
    const supabase = createAdminClient();

    // Step 1: Verify lock exists on-chain
    log.info(`Verifying lock exists on-chain: ${lockAddress}`);

    try {
      const totalKeys = await unlockUtils.getTotalKeys(lockAddress);
      log.info(`Lock verified on-chain with ${totalKeys} total keys`);
    } catch (error) {
      log.error("Lock verification failed:", error);
      return res.status(400).json({
        error: "Lock address does not exist on-chain or is invalid",
        lockAddress,
      });
    }

    // Step 2: Check if lock address is already in use
    const { data: existingLock, error: lockCheckError } = await supabase
      .from("lock_registry")
      .select("entity_type, entity_id")
      .eq("lock_address", lockAddress)
      .maybeSingle();

    if (lockCheckError) {
      log.error("Error checking lock registry:", lockCheckError);
      return res.status(500).json({
        error: "Database error while checking lock registry",
      });
    }

    if (existingLock) {
      return res.status(409).json({
        error: `Lock address already in use by ${existingLock.entity_type}: ${existingLock.entity_id}`,
        existingEntity: existingLock,
      });
    }

    // Step 3: Create database entry based on entity type
    let result;
    const now = new Date().toISOString();

    switch (entityType) {
      case "bootcamp":
        const bootcampData = {
          ...entityData,
          lock_address: lockAddress,
          created_at: now,
          updated_at: now,
        };

        const { data: bootcamp, error: bootcampError } = await supabase
          .from("bootcamp_programs")
          .insert(bootcampData)
          .select()
          .single();

        if (bootcampError) throw bootcampError;
        result = { type: "bootcamp", data: bootcamp };
        break;

      case "cohort":
        const cohortData = {
          ...entityData,
          lock_address: lockAddress,
          created_at: now,
          updated_at: now,
        };

        const { data: cohort, error: cohortError } = await supabase
          .from("cohorts")
          .insert(cohortData)
          .select()
          .single();

        if (cohortError) throw cohortError;
        result = { type: "cohort", data: cohort };
        break;

      case "quest":
        const questData = {
          ...entityData,
          lock_address: lockAddress,
          created_at: now,
          updated_at: now,
        };

        const { data: quest, error: questError } = await supabase
          .from("quests")
          .insert(questData)
          .select()
          .single();

        if (questError) throw questError;
        result = { type: "quest", data: quest };
        break;

      case "milestone":
        const milestoneData = {
          ...entityData,
          lock_address: lockAddress,
          created_at: now,
          updated_at: now,
        };

        const { data: milestone, error: milestoneError } = await supabase
          .from("cohort_milestones")
          .insert(milestoneData)
          .select()
          .single();

        if (milestoneError) throw milestoneError;
        result = { type: "milestone", data: milestone };
        break;

      default:
        return res.status(400).json({ error: "Unsupported entity type" });
    }

    log.info(
      `Successfully recovered ${entityType} with lock address:`,
      lockAddress,
    );

    return res.status(200).json({
      success: true,
      message: `${entityType} created successfully with recovered lock address`,
      deploymentId,
      lockAddress,
      entity: result,
    });
  } catch (error: any) {
    log.error(`Recovery failed for ${entityType}:`, error);

    return res.status(500).json({
      success: false,
      error: error.message || "Database creation failed during recovery",
      deploymentId,
      lockAddress,
      entityType,
    });
  }
}

// Wrap with admin authentication
export default withAdminAuth(handler);
