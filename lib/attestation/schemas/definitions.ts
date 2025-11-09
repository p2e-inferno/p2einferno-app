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
    "address walletAddress,string greeting,uint256 timestamp,string userDid,uint256 xpGained",
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
 * Get all predefined schemas for easy registration
 * Called lazily to avoid requiring schema UIDs at module load time
 */
export const getPredefinedSchemas = () => [
  getDailyCheckinSchema(),
  getQuestCompletionSchema(),
  getBootcampCompletionSchema(),
  getMilestoneAchievementSchema(),
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
