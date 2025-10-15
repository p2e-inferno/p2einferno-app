/**
 * Predefined schema definitions for P2E Inferno
 */

import { AttestationSchema } from "../core/types";
import { P2E_SCHEMA_UIDS } from "../core/config";

/**
 * Daily Check-in Schema - Simple daily engagement attestation
 */
export const DAILY_CHECKIN_SCHEMA: Omit<
  AttestationSchema,
  "id" | "created_at" | "updated_at"
> = {
  schema_uid: P2E_SCHEMA_UIDS.DAILY_CHECKIN,
  name: "Daily Check-in",
  description: "Simple daily check-in attestation for user engagement",
  schema_definition:
    "address walletAddress,string greeting,uint256 timestamp,string userDid,uint256 xpGained",
  category: "attendance",
  revocable: false, // Daily check-ins should be permanent
};

/**
 * Quest Completion Schema - For completed learning quests
 */
export const QUEST_COMPLETION_SCHEMA: Omit<
  AttestationSchema,
  "id" | "created_at" | "updated_at"
> = {
  schema_uid: P2E_SCHEMA_UIDS.QUEST_COMPLETION,
  name: "Quest Completion",
  description: "Attestation for completed learning quests",
  schema_definition:
    "string questId,string questTitle,address userAddress,uint256 completionDate,uint256 xpEarned,string difficulty",
  category: "achievement",
  revocable: false, // Quest completions should be permanent
};

/**
 * Bootcamp Completion Schema - For completed bootcamp programs
 */
export const BOOTCAMP_COMPLETION_SCHEMA: Omit<
  AttestationSchema,
  "id" | "created_at" | "updated_at"
> = {
  schema_uid: P2E_SCHEMA_UIDS.BOOTCAMP_COMPLETION,
  name: "Bootcamp Completion",
  description: "Bootcamp completion attestation with cohort tracking",
  schema_definition:
    "string cohortId,string cohortName,string bootcampId,string bootcampTitle,address userAddress,uint256 completionDate,uint256 totalXpEarned,string certificateTxHash",
  category: "achievement",
  revocable: false,
};


/**
 * Milestone Achievement Schema - For individual milestone completions
 */
export const MILESTONE_ACHIEVEMENT_SCHEMA: Omit<
  AttestationSchema,
  "id" | "created_at" | "updated_at"
> = {
  schema_uid: P2E_SCHEMA_UIDS.MILESTONE_ACHIEVEMENT,
  name: "Milestone Achievement",
  description: "Attestation for milestone achievements in learning journey",
  schema_definition:
    "string milestoneId,string milestoneTitle,address userAddress,uint256 achievementDate,uint256 xpEarned,string skillLevel",
  category: "achievement",
  revocable: false, // Milestone achievements should be permanent
};

/**
 * All predefined schemas for easy registration
 */
export const PREDEFINED_SCHEMAS = [
  DAILY_CHECKIN_SCHEMA,
  QUEST_COMPLETION_SCHEMA,
  BOOTCAMP_COMPLETION_SCHEMA,
  MILESTONE_ACHIEVEMENT_SCHEMA,
] as const;

/**
 * Get schema definition by UID
 */
export const getSchemaDefinitionByUid = (
  schemaUid: string,
): (typeof PREDEFINED_SCHEMAS)[number] | null => {
  return (
    PREDEFINED_SCHEMAS.find((schema) => schema.schema_uid === schemaUid) || null
  );
};

/**
 * Validate if a schema UID is a predefined P2E Inferno schema
 */
export const isPredefinedSchema = (schemaUid: string): boolean => {
  return Object.values(P2E_SCHEMA_UIDS).includes(schemaUid as any);
};
