/**
 * Predefined schema definitions for P2E Inferno
 */

import { AttestationSchema } from "../core/types";
import { requireSchemaUID } from "../core/config";

/**
 * Daily Check-in Schema - Simple daily engagement attestation
 * Only available when EAS is enabled
 */
export const getDailyCheckinSchema = (): Omit<
  AttestationSchema,
  "id" | "created_at" | "updated_at"
> => ({
  schema_uid: requireSchemaUID('DAILY_CHECKIN'),
  name: "Daily Check-in",
  description: "Simple daily check-in attestation for user engagement",
  schema_definition:
    "address walletAddress,string greeting,uint256 timestamp,uint256 xpGained",
  category: "attendance",
  revocable: false, // Daily check-ins should be permanent
});

/**
 * Quest Completion Schema - For completed learning quests
 */
export const getQuestCompletionSchema = (): Omit<
  AttestationSchema,
  "id" | "created_at" | "updated_at"
> => ({
  schema_uid: requireSchemaUID('QUEST_COMPLETION'),
  name: "Quest Completion",
  description: "Attestation for completed learning quests",
  schema_definition:
    "string questId,string questTitle,address userAddress,uint256 completionDate,uint256 xpEarned,string difficulty",
  category: "achievement",
  revocable: false, // Quest completions should be permanent
});

/**
 * Bootcamp Completion Schema - For completed bootcamp programs
 */
export const getBootcampCompletionSchema = (): Omit<
  AttestationSchema,
  "id" | "created_at" | "updated_at"
> => ({
  schema_uid: requireSchemaUID('BOOTCAMP_COMPLETION'),
  name: "Bootcamp Completion",
  description: "Bootcamp completion attestation with cohort tracking",
  schema_definition:
    "string cohortId,string cohortName,string bootcampId,string bootcampTitle,address userAddress,uint256 completionDate,uint256 totalXpEarned,string certificateTxHash",
  category: "achievement",
  revocable: false,
});

/**
 * Milestone Achievement Schema - For individual milestone completions
 */
export const getMilestoneAchievementSchema = (): Omit<
  AttestationSchema,
  "id" | "created_at" | "updated_at"
> => ({
  schema_uid: requireSchemaUID('MILESTONE_ACHIEVEMENT'),
  name: "Milestone Achievement",
  description: "Attestation for milestone achievements in learning journey",
  schema_definition:
    "string milestoneId,string milestoneTitle,address userAddress,uint256 achievementDate,uint256 xpEarned,string skillLevel",
  category: "achievement",
  revocable: false, // Milestone achievements should be permanent
});

/**
 * XP Renewal Schema - For subscription renewals using XP
 */
export const getXpRenewalSchema = (): Omit<
  AttestationSchema,
  "id" | "created_at" | "updated_at"
> => ({
  schema_uid: requireSchemaUID('XP_RENEWAL'),
  name: "XP Subscription Renewal",
  description: "On-chain attestation for subscription renewals using XP. Creates immutable audit trail for off-chain renewal transaction.",
  schema_definition:
    "address userAddress,address subscriptionLockAddress,uint256 amountXp,uint256 serviceFeeXp,uint256 durationDays,uint256 newExpirationTimestamp,bytes32 renewalTxHash",
  category: "transaction",
  revocable: false,
});

/**
 * DG Withdrawal Schema - For DG token withdrawals
 */
export const getDgWithdrawalSchema = (): Omit<
  AttestationSchema,
  "id" | "created_at" | "updated_at"
> => ({
  schema_uid: requireSchemaUID('DG_WITHDRAWAL'),
  name: "DG Token Withdrawal",
  description: "On-chain attestation for DG token withdrawals. Creates audit trail for token transfers.",
  schema_definition:
    "address userAddress,uint256 amountDg,uint256 withdrawalTimestamp,bytes32 withdrawalTxHash",
  category: "transaction",
  revocable: false,
});

/**
 * DG Config Change Schema - For admin changes to DG withdrawal limits
 */
export const getDgConfigChangeSchema = (): Omit<
  AttestationSchema,
  "id" | "created_at" | "updated_at"
> => ({
  schema_uid: requireSchemaUID('DG_CONFIG_CHANGE'),
  name: "DG Withdrawal Config Change",
  description: "On-chain attestation for admin changes to DG withdrawal limits. Creates governance audit trail.",
  schema_definition:
    "address adminAddress,uint256 previousMinAmount,uint256 newMinAmount,uint256 previousMaxDaily,uint256 newMaxDaily,uint256 changeTimestamp,string changeReason",
  category: "governance",
  revocable: false,
});

/**
 * Milestone Task Reward Claim Schema - For XP rewards from individual milestone tasks
 */
export const getMilestoneTaskRewardClaimSchema = (): Omit<
  AttestationSchema,
  "id" | "created_at" | "updated_at"
> => ({
  schema_uid: requireSchemaUID('MILESTONE_TASK_REWARD_CLAIM'),
  name: "Milestone Task Reward Claim",
  description: "On-chain attestation for claiming XP rewards for individual milestone task completions. Creates audit trail for XP awards.",
  schema_definition:
    "string milestoneId,address userAddress,address milestoneLockAddress,uint256 rewardAmount,uint256 claimTimestamp",
  category: "achievement",
  revocable: false,
});

/**
 * Quest Task Reward Claim Schema - For XP rewards from individual quest tasks
 */
export const getQuestTaskRewardClaimSchema = (): Omit<
  AttestationSchema,
  "id" | "created_at" | "updated_at"
> => ({
  schema_uid: requireSchemaUID('QUEST_TASK_REWARD_CLAIM'),
  name: "Quest Task Reward Claim",
  description: "On-chain attestation for claiming XP rewards for individual quest task completions. Creates audit trail for XP awards.",
  schema_definition:
    "string questId,string taskId,string taskType,address userAddress,address questLockAddress,uint256 rewardAmount,uint256 claimTimestamp",
  category: "achievement",
  revocable: false,
});

/**
 * Get all predefined schemas for easy registration
 * Called lazily to avoid requiring schema UIDs at module load time
 */
export const getPredefinedSchemas = () => [
  getDailyCheckinSchema(),
  getQuestCompletionSchema(),
  getBootcampCompletionSchema(),
  getMilestoneAchievementSchema(),
  getXpRenewalSchema(),
  getDgWithdrawalSchema(),
  getDgConfigChangeSchema(),
  getMilestoneTaskRewardClaimSchema(),
  getQuestTaskRewardClaimSchema(),
];

/**
 * Get schema definition by UID
 */
export const getSchemaDefinitionByUid = (
  schemaUid: string,
): ReturnType<typeof getDailyCheckinSchema> | null => {
  const schemas = getPredefinedSchemas();
  return (
    schemas.find((schema) => schema.schema_uid === schemaUid) || null
  );
};

/**
 * Validate if a schema UID is a predefined P2E Inferno schema
 */
export const isPredefinedSchema = (schemaUid: string): boolean => {
  const schemas = getPredefinedSchemas();
  return schemas.some((schema) => schema.schema_uid === schemaUid);
};
